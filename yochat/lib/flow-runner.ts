import type {
  BrandConfig,
  Contact,
  Conversation,
  FlowDefinition,
  FlowNode,
  IncomingEvent,
  Intent,
} from "@/lib/types";
import type { HttpOutcome } from "@/lib/http";

/**
 * Wave 2 — pure flow interpreter (Stage 1).
 *
 * Deliberately side-effect free: no store access, no sends, no AI calls.
 * The caller supplies hooks (AI generation) and applies the returned
 * actions to real state (or discards them in dry-run). This mirrors the
 * ZernFlow simulator pattern: the dry-run path and the live path share
 * exactly one traversal implementation.
 */

export type FlowRunContext = {
  event: IncomingEvent;
  brand: BrandConfig;
  contact: Contact;
  conversation: Conversation;
  intent: Intent;
  isFirstMessage: boolean;
};

export type FlowAction =
  | { kind: "send_text"; text: string; quickReplies?: string[]; nodeId: string }
  | { kind: "ai_reply"; text: string; nodeId: string }
  | { kind: "update_contact"; tags: string[]; fields: Record<string, string>; nodeId: string }
  | { kind: "collect"; kinds: Array<"email" | "phone" | "name">; collected: { email?: string; phone?: string }; nodeId: string }
  | { kind: "schedule_followup"; minutes: number; text: string; nodeId: string }
  | { kind: "handoff"; reason: string; nodeId: string }
  | { kind: "http_request"; nodeId: string; outcome: HttpOutcome };

export type FlowTraceStep = {
  nodeId: string;
  nodeType: string;
  nodeName?: string;
  detail?: string;
  branch?: string;
};

export type FlowRunResult = {
  actions: FlowAction[];
  trace: FlowTraceStep[];
  completed: boolean;
  stopReason?: string;
  /** joined send_text/ai_reply texts; undefined when the flow produced no sendable text */
  reply?: string;
  /**
   * Wave 4: set when the interpreter stopped at a `wait` node. The caller
   * arms a persistent wait on the contact (resumeNodeId = wait.next,
   * timeoutNodeId = wait.nextTimeout).
   */
  waitArmed?: {
    waitNodeId: string;
    resumeNodeId: string;
    timeoutNodeId?: string;
    timeoutMinutes: number;
    label?: string;
  };
};

/**
 * Wave 4: the interpreter only needs the node graph + entry point. Both
 * FlowDefinition (live) and FlowVersionSnapshot (pinned, for resumes) satisfy
 * this shape, so a resume always runs the exact version that was armed.
 */
export type FlowShape = {
  nodes: Record<string, FlowNode>;
  entryNodeId: string;
};

export type FlowRunnerHooks = {
  /** Live: grounded AI via the engine. Dry-run: stubbed placeholder. */
  generateAi?: (text: string) => Promise<string>;
  /**
   * Wave 7: bounded outbound HTTP for `http_request` nodes. Live: the
   * executeBoundedHttp primitive (allowlist + SSRF + timeout + secrets +
   * audit). Dry-run: stubbed — no network, outcome "skipped".
   */
  executeHttp?: (spec: HttpExecuteSpec) => Promise<HttpOutcome>;
};

export type HttpExecuteSpec = {
  nodeId: string;
  /** Already interpolated (contact/message vars); {{secret:NAME}} NOT resolved — the hook does that. */
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

/** Trace-safe one-liner: method + host + outcome only. Never query strings, bodies, or secret values. */
function summarizeHttpOutcome(spec: HttpExecuteSpec, outcome: HttpOutcome): string {
  let host = outcome.host;
  if (!host) {
    try {
      host = new URL(spec.url).hostname;
    } catch {
      host = "invalid-url";
    }
  }
  const status = outcome.status !== undefined ? ` ${outcome.status}` : "";
  const size = ` (${outcome.responseBytes} bytes${outcome.truncated ? ", truncated" : ""})`;
  const tail = outcome.error ? `: ${outcome.error}` : "";
  return `${outcome.method} ${host} → ${outcome.outcome}${status}${outcome.outcome === "success" ? size : ""}${tail}`;
}

const MAX_TRAVERSAL_STEPS = 50;

/** Mirrors lib/engine.ts extractContactDetails regexes (kept in sync by convention). */
function extractContactDetails(text: string): { email?: string; phone?: string } {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0];
  return { email, phone };
}

function splitKeywords(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function interpolate(template: string, ctx: FlowRunContext): string {
  const firstName = ctx.contact.name?.split(" ")[0] ?? ctx.contact.username ?? "there";
  return template
    .replace(/\{\{\s*message\s*\}\}/g, ctx.event.text)
    .replace(/\{\{\s*contact\.name\s*\}\}/g, ctx.contact.name ?? ctx.contact.username ?? "there")
    .replace(/\{\{\s*contact\.first_name\s*\}\}/g, firstName)
    .replace(/\{\{\s*brand\.shortName\s*\}\}/g, ctx.brand.shortName)
    .replace(/\{\{\s*brand\.name\s*\}\}/g, ctx.brand.name);
}

function evaluatePredicate(node: FlowNode, ctx: FlowRunContext): { matched: boolean; detail: string } {
  const predicate = node.config.predicate;
  if (!predicate) return { matched: false, detail: "no predicate configured" };
  const text = ctx.event.text.toLowerCase();
  switch (predicate.kind) {
    case "contains": {
      const keywords = splitKeywords(predicate.value);
      const hit = keywords.find((keyword) => text.includes(keyword));
      return { matched: Boolean(hit), detail: hit ? `matched "${hit}"` : "no keyword matched" };
    }
    case "intent":
      return { matched: ctx.intent === predicate.value, detail: `intent=${ctx.intent}` };
    case "has_tag":
      return { matched: ctx.contact.tags.includes(predicate.value ?? ""), detail: `tag "${predicate.value}"` };
    case "is_first_message":
      return { matched: ctx.isFirstMessage, detail: `first=${ctx.isFirstMessage}` };
    case "opted_out":
      return { matched: ctx.contact.optedOut, detail: `optedOut=${ctx.contact.optedOut}` };
    default:
      return { matched: false, detail: `unknown predicate kind ${(predicate as { kind: string }).kind}` };
  }
}

function nextNodeId(node: FlowNode, branch?: "true" | "false" | "success" | "failure"): string | undefined {
  if (branch === "true") return node.nextTrue ?? node.next;
  if (branch === "false") return node.nextFalse ?? node.next;
  if (branch === "success") return node.nextSuccess ?? node.next;
  if (branch === "failure") return node.nextFailure;
  return node.next;
}

export async function runFlow(
  flow: FlowShape,
  ctx: FlowRunContext,
  hooks: FlowRunnerHooks = {},
  startNodeId?: string,
): Promise<FlowRunResult> {
  const actions: FlowAction[] = [];
  const trace: FlowTraceStep[] = [];
  const visited = new Set<string>();
  // Wave 4: resumes start at a pinned node instead of the entry node.
  let currentId: string | undefined = startNodeId ?? flow.entryNodeId;
  let steps = 0;

  while (currentId) {
    if (steps >= MAX_TRAVERSAL_STEPS) {
      return { actions, trace, completed: false, stopReason: "max_steps_exceeded", reply: buildReply(actions) };
    }
    if (visited.has(currentId)) {
      return { actions, trace, completed: false, stopReason: "cycle_detected", reply: buildReply(actions) };
    }
    const node = flow.nodes[currentId];
    if (!node) {
      return { actions, trace, completed: false, stopReason: `dangling_reference:${currentId}`, reply: buildReply(actions) };
    }
    visited.add(currentId);
    steps += 1;

    switch (node.type) {
      case "trigger": {
        trace.push({ nodeId: node.id, nodeType: node.type, nodeName: node.name, detail: "entry" });
        currentId = nextNodeId(node);
        break;
      }
      case "send_text": {
        const text = interpolate(node.config.text ?? "", ctx).trim();
        actions.push({ kind: "send_text", text, quickReplies: node.config.quickReplies, nodeId: node.id });
        trace.push({ nodeId: node.id, nodeType: node.type, nodeName: node.name, detail: text.slice(0, 80) });
        currentId = nextNodeId(node);
        break;
      }
      case "condition": {
        const { matched, detail } = evaluatePredicate(node, ctx);
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          detail,
          branch: matched ? "true" : "false",
        });
        currentId = nextNodeId(node, matched ? "true" : "false");
        break;
      }
      case "ai_response": {
        const text = hooks.generateAi
          ? await hooks.generateAi(ctx.event.text)
          : "[AI reply — no generator supplied]";
        actions.push({ kind: "ai_reply", text, nodeId: node.id });
        trace.push({ nodeId: node.id, nodeType: node.type, nodeName: node.name, detail: text.slice(0, 80) });
        currentId = nextNodeId(node);
        break;
      }
      case "update_contact": {
        const tags = (node.config.tags ?? []).filter(Boolean);
        const fields = node.config.fields ?? {};
        actions.push({ kind: "update_contact", tags, fields, nodeId: node.id });
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          detail: [`tags:${tags.join(",")}`, `fields:${Object.keys(fields).join(",")}`].filter((part) => !part.endsWith(":")).join(" "),
        });
        currentId = nextNodeId(node);
        break;
      }
      case "collect": {
        const kinds = node.config.kinds ?? [];
        const details = extractContactDetails(ctx.event.text);
        const collected: { email?: string; phone?: string } = {};
        let found = false;
        if (kinds.includes("email") && details.email) {
          collected.email = details.email;
          found = true;
        }
        if (kinds.includes("phone") && details.phone) {
          collected.phone = details.phone;
          found = true;
        }
        if (kinds.includes("name") && !ctx.contact.name) {
          // Stage 1: name collection records the attempt; free-text name
          // parsing is unreliable without an explicit prompt format.
          found = found || ctx.event.text.trim().length > 0;
        }
        actions.push({ kind: "collect", kinds, collected, nodeId: node.id });
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          detail: found ? `collected ${Object.keys(collected).join(", ") || "name-attempt"}` : "nothing collected",
          branch: found ? "success" : "failure",
        });
        if (!found) {
          const failureNext = nextNodeId(node, "failure");
          return {
            actions,
            trace,
            completed: !failureNext,
            stopReason: failureNext ? undefined : "collect_failed",
            reply: buildReply(actions),
          };
        }
        currentId = nextNodeId(node, "success");
        break;
      }
      case "delay": {
        const minutes = Math.max(1, Math.min(60 * 24 * 7, Math.floor(node.config.minutes ?? 0)));
        const text = interpolate(node.config.text ?? "", ctx).trim();
        actions.push({ kind: "schedule_followup", minutes, text, nodeId: node.id });
        trace.push({ nodeId: node.id, nodeType: node.type, nodeName: node.name, detail: `+${minutes}min` });
        // Stage 1: a delay schedules the follow-up message and ends the run.
        // Continuing the flow after the wait is a later-stage feature.
        return { actions, trace, completed: true, stopReason: "scheduled_followup", reply: buildReply(actions) };
      }
      case "wait": {
        // Wave 4: pause the run. The caller arms a persistent wait on the
        // contact and resumes at `next` (inbound reply) or `nextTimeout`
        // (timeout fired). Validation guarantees `next` exists.
        const timeoutMinutes = Math.max(1, Math.min(60 * 24 * 7, Math.floor(node.config.timeoutMinutes ?? 1440)));
        const resumeNodeId = node.next!;
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          detail: `waiting (timeout ${timeoutMinutes}min${node.nextTimeout ? `, onTimeout→${node.nextTimeout}` : ""})`,
        });
        return {
          actions,
          trace,
          completed: false,
          stopReason: "waiting_for_input",
          reply: buildReply(actions),
          waitArmed: {
            waitNodeId: node.id,
            resumeNodeId,
            timeoutNodeId: node.nextTimeout,
            timeoutMinutes,
            label: node.config.waitLabel ?? node.name,
          },
        };
      }
      case "handoff": {
        const reason = node.config.reason?.trim() || "flow handoff";
        actions.push({ kind: "handoff", reason, nodeId: node.id });
        trace.push({ nodeId: node.id, nodeType: node.type, nodeName: node.name, detail: reason });
        return { actions, trace, completed: true, stopReason: "handoff", reply: buildReply(actions) };
      }
      case "http_request": {
        // Wave 7: bounded outbound HTTP. The interpreter stays side-effect
        // free — the hook owns the network. Secrets are resolved inside the
        // hook (server memory only); the trace carries method + host +
        // outcome only, never query strings, bodies, or secret values.
        const method = (node.config.httpMethod ?? "GET").toUpperCase();
        const url = interpolate(node.config.httpUrl ?? "", ctx);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(node.config.httpHeaders ?? {})) {
          headers[key] = interpolate(value, ctx);
        }
        const body = node.config.httpBody !== undefined ? interpolate(node.config.httpBody, ctx) : undefined;
        const spec: HttpExecuteSpec = { nodeId: node.id, method, url, headers, body };
        const outcome: HttpOutcome = hooks.executeHttp
          ? await hooks.executeHttp(spec)
          : {
              outcome: "skipped",
              method,
              host: "",
              responseBytes: 0,
              truncated: false,
              secretNames: [],
              error: "no HTTP executor supplied",
            };
        actions.push({ kind: "http_request", nodeId: node.id, outcome });
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          detail: summarizeHttpOutcome(spec, outcome),
          branch: outcome.outcome === "success" ? "success" : "failure",
        });
        // One attempt + recorded outcome. The flow CONTINUES on failure
        // (branch "failure" is observable); a failed call is not fatal.
        currentId = nextNodeId(node, outcome.outcome === "success" ? "success" : "failure");
        break;
      }
      case "end": {
        trace.push({ nodeId: node.id, nodeType: node.type, nodeName: node.name, detail: "terminal" });
        return { actions, trace, completed: true, reply: buildReply(actions) };
      }
      default: {
        return {
          actions,
          trace,
          completed: false,
          stopReason: `unknown_node_type:${(node as FlowNode).type}`,
          reply: buildReply(actions),
        };
      }
    }
  }

  return { actions, trace, completed: true, stopReason: "fell_off_graph", reply: buildReply(actions) };
}

function buildReply(actions: FlowAction[]): string | undefined {
  const texts = actions
    .filter((action) => action.kind === "send_text" || action.kind === "ai_reply")
    .map((action) => (action.kind === "send_text" || action.kind === "ai_reply" ? action.text : ""))
    .filter(Boolean);
  if (texts.length === 0) return undefined;
  // Stage 1: multiple send nodes are joined into one reply body.
  // Multi-bubble sends are a later refinement.
  return texts.join("\n\n");
}

export type DryRunOptions = {
  text: string;
  trigger?: IncomingEvent["trigger"];
  brand: BrandConfig;
  contactName?: string;
  username?: string;
};

/** Pure dry-run: synthetic contact, no state writes, AI stubbed. Safe for the admin test panel. */
export async function dryRunFlow(flow: FlowDefinition, options: DryRunOptions): Promise<FlowRunResult> {
  const now = new Date().toISOString();
  const senderId = `dryrun:${flow.id}:${Date.now()}`;
  const contact: Contact = {
    id: `dryrun-contact:${senderId}`,
    brand: flow.brand,
    channel: "test",
    externalId: senderId,
    username: options.username ?? "dry-run-user",
    name: options.contactName,
    tags: [],
    fields: {},
    leadStage: "new",
    optedOut: false,
    automationPaused: false,
    notes: [],
    firstSeenAt: now,
    lastSeenAt: now,
    source: "dry_run",
  };
  const conversation: Conversation = {
    id: `dryrun-conv:${senderId}`,
    contactId: contact.id,
    brand: flow.brand,
    channel: "test",
    accountId: "dryrun",
    status: "open",
    lastIntent: "unknown",
    summary: "",
    createdAt: now,
    updatedAt: now,
  };
  const event: IncomingEvent = {
    id: `dryrun-event:${senderId}`,
    channel: "test",
    accountId: "dryrun",
    senderId,
    trigger: options.trigger ?? "message",
    text: options.text,
    timestamp: now,
    metadata: { dryRun: true, flowId: flow.id, flowVersion: flow.version },
  };
  return runFlow(
    flow,
    { event, brand: options.brand, contact, conversation, intent: "unknown", isFirstMessage: true },
    {
      generateAi: async () => "[AI reply — dry run, no model call]",
      // Wave 7: the admin test panel never performs real outbound HTTP.
      executeHttp: async (spec) => ({
        outcome: "skipped",
        method: spec.method.toUpperCase(),
        host: (() => {
          try {
            return new URL(spec.url).hostname;
          } catch {
            return "";
          }
        })(),
        responseBytes: 0,
        truncated: false,
        secretNames: [],
        error: "dry run: outbound HTTP not executed in the test panel",
      }),
    },
  );
}
