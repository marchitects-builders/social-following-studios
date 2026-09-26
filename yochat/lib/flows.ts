import { randomUUID } from "node:crypto";
import { addAnalytics, addAudit, loadState, mutateState } from "@/lib/store";
import {
  httpValidationContextFromState,
  isHostAllowlisted,
  referencedSecretNames,
  type HttpValidationContext,
} from "@/lib/http";
import type {
  ActiveFlowWait,
  BrandConfig,
  BrandKey,
  DeliveryJob,
  FlowCompiledTrigger,
  FlowDefinition,
  FlowNode,
  FlowNodeType,
  FlowValidationResult,
  FlowVersionSnapshot,
  IncomingEvent,
  MessageRecord,
  YochatState,
} from "@/lib/types";
import type { FlowAction } from "@/lib/flow-runner";

const MAX_VERSION_SNAPSHOTS = 20;
const VALID_NODE_TYPES: ReadonlySet<string> = new Set([
  "trigger",
  "send_text",
  "condition",
  "ai_response",
  "update_contact",
  "collect",
  "delay",
  "wait",
  "handoff",
  "http_request",
  "end",
]);

function newFlowId(): string {
  return `flow_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function summarize(flow: FlowDefinition) {
  return {
    id: flow.id,
    brand: flow.brand,
    name: flow.name,
    status: flow.status,
    version: flow.version,
    nodeCount: Object.keys(flow.nodes).length,
    updatedAt: flow.updatedAt,
    publishedAt: flow.publishedAt,
  };
}

// ─── Validation ───

function nodeRefs(node: FlowNode): string[] {
  return [node.next, node.nextTrue, node.nextFalse, node.nextSuccess, node.nextFailure, node.nextTimeout].filter(
    (ref): ref is string => Boolean(ref),
  );
}

export type FlowValidationOptions = {
  /**
   * Wave 7: when provided, http_request nodes are checked against the
   * brand's allowlist and secret store at validation time. publishFlow
   * always supplies this; the admin "validate" action should too.
   */
  http?: HttpValidationContext;
};

export function validateFlowDefinition(
  nodes: Record<string, FlowNode>,
  entryNodeId: string,
  options: FlowValidationOptions = {},
): FlowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(Object.keys(nodes));

  if (!entryNodeId || !nodes[entryNodeId]) {
    errors.push(`entry node "${entryNodeId}" does not exist`);
    return { valid: false, errors, warnings };
  }
  const entry = nodes[entryNodeId];
  if (entry.type !== "trigger") errors.push(`entry node "${entryNodeId}" must be a trigger node`);

  for (const [id, node] of Object.entries(nodes)) {
    if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push(`node "${id}" has unknown type "${(node as { type: string }).type}"`);
      continue;
    }
    for (const ref of nodeRefs(node)) {
      if (!nodeIds.has(ref)) errors.push(`node "${id}" references missing node "${ref}"`);
    }
    const config = node.config ?? {};
    switch (node.type as FlowNodeType) {
      case "trigger": {
        if (id !== entryNodeId) warnings.push(`node "${id}" is a trigger node but not the entry node; it will never fire`);
        if (!config.trigger || config.trigger.triggerTypes.length === 0) {
          errors.push(`trigger node "${id}" must declare at least one trigger type`);
        }
        break;
      }
      case "send_text":
        if (!config.text?.trim()) errors.push(`send_text node "${id}" needs non-empty text`);
        break;
      case "condition":
        if (!config.predicate) errors.push(`condition node "${id}" needs a predicate`);
        break;
      case "update_contact": {
        const hasTags = (config.tags ?? []).length > 0;
        const hasFields = config.fields != null && Object.keys(config.fields).length > 0;
        if (!hasTags && !hasFields) errors.push(`update_contact node "${id}" needs at least one tag or field`);
        break;
      }
      case "collect":
        if (!config.kinds || config.kinds.length === 0) errors.push(`collect node "${id}" needs at least one kind`);
        break;
      case "delay":
        if (!config.minutes || config.minutes <= 0) errors.push(`delay node "${id}" needs minutes > 0`);
        if (!config.text?.trim()) errors.push(`delay node "${id}" needs follow-up text`);
        break;
      case "wait": {
        // Wave 4: a wait MUST have a resume path. Without `next` the reply
        // would arm a wait that can never resume on inbound.
        if (!node.next) errors.push(`wait node "${id}" needs a "next" node (resume path on inbound reply)`);
        const timeoutMinutes = config.timeoutMinutes ?? 1440;
        if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 60 * 24 * 7) {
          errors.push(`wait node "${id}" needs timeoutMinutes between 1 and 10080 (default 1440)`);
        }
        break;
      }
      case "ai_response":
      case "handoff":
      case "end":
        break;
      case "http_request": {
        // Wave 7: bounded outbound HTTP. Publish-time gate: the URL's host
        // must be on the brand's allowlist (deny by default) and every
        // {{secret:NAME}} must exist in the brand's secret store. The
        // hostname must be literal — placeholders in the host would defeat
        // the allowlist check (they're fine in path/query/headers/body).
        const method = (config.httpMethod ?? "GET").toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          errors.push(`http_request node "${id}" needs httpMethod GET|POST|PUT|PATCH|DELETE`);
        }
        const rawUrl = config.httpUrl?.trim();
        if (!rawUrl) {
          errors.push(`http_request node "${id}" needs a URL`);
        } else {
          let host = "";
          try {
            const parsed = new URL(rawUrl);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              errors.push(`http_request node "${id}" URL must use http(s)`);
            } else {
              host = parsed.hostname;
            }
          } catch {
            errors.push(`http_request node "${id}" has an invalid URL`);
          }
          if (host.includes("{{") || host.includes("}}")) {
            errors.push(`http_request node "${id}" must have a literal hostname (no placeholders) so the allowlist can be checked`);
          } else if (host && options.http && !isHostAllowlisted(host, options.http.allowlist)) {
            errors.push(
              `http_request node "${id}" targets host "${host}" which is not in the brand's HTTP allowlist (deny by default)`,
            );
          }
        }
        if (config.httpHeaders) {
          for (const [key, value] of Object.entries(config.httpHeaders)) {
            if (!key.trim() || value === undefined) {
              errors.push(`http_request node "${id}" has an invalid header entry`);
            }
          }
        }
        if (options.http) {
          for (const name of referencedSecretNames(config)) {
            if (!options.http.secretNames.includes(name)) {
              errors.push(`http_request node "${id}" references unknown secret "${name}"`);
            }
          }
        }
        break;
      }
    }
  }

  // Reachability + cycle warnings via DFS from entry.
  const reachable = new Set<string>();
  const stack = [entryNodeId];
  const onPath = new Set<string>();
  let cycleFound = false;
  const visit = (id: string): void => {
    if (onPath.has(id)) {
      cycleFound = true;
      return;
    }
    if (reachable.has(id)) return;
    reachable.add(id);
    onPath.add(id);
    const node = nodes[id];
    if (node) for (const ref of nodeRefs(node)) visit(ref);
    onPath.delete(id);
  };
  visit(entryNodeId);
  for (const id of nodeIds) {
    if (!reachable.has(id)) warnings.push(`node "${id}" is unreachable from the entry node`);
  }
  if (cycleFound) warnings.push("graph contains a cycle; the runtime caps traversal at 50 steps");

  // Gemini R2 anti-pattern "branching blindness": conditions nested inside
  // condition branches are unreadable and un-debuggable. Warn, don't block —
  // the recommended pattern is one condition acting as a router.
  for (const node of Object.values(nodes)) {
    if (node.type !== "condition") continue;
    const seen = new Set<string>();
    const findNested = (id: string): void => {
      if (seen.has(id)) return;
      seen.add(id);
      const target = nodes[id];
      if (!target || target.id === node.id) return;
      if (target.type === "condition") {
        warnings.push(
          `condition node "${node.id}" branches into another condition ("${target.id}"); keep flows flat — use one condition as a router`,
        );
        return;
      }
      for (const ref of nodeRefs(target)) findNested(ref);
    };
    for (const ref of nodeRefs(node)) findNested(ref);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Trigger compilation (publish-time; runtime never parses the graph) ───

export function buildCompiledTriggers(flow: FlowDefinition): FlowCompiledTrigger[] {
  const entry = flow.nodes[flow.entryNodeId];
  const trigger = entry?.config.trigger;
  if (!trigger || trigger.triggerTypes.length === 0) return [];
  return [
    {
      flowId: flow.id,
      version: flow.version,
      triggerTypes: [...trigger.triggerTypes],
      keywords: (trigger.keywords ?? []).map((keyword) => keyword.toLowerCase()).filter(Boolean),
      firstMessageOnly: trigger.firstMessageOnly ?? false,
    },
  ];
}

/** Deterministic: published flows of the brand, sorted by id, first trigger match wins. */
export function findMatchingFlow(
  state: YochatState,
  brandKey: BrandKey,
  event: IncomingEvent,
  isFirstMessage: boolean,
): FlowDefinition | undefined {
  const text = event.text.toLowerCase();
  const candidates = Object.values(state.flows)
    .filter((flow) => flow.brand === brandKey && flow.status === "published")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const flow of candidates) {
    for (const compiled of flow.compiledTriggers) {
      if (!compiled.triggerTypes.includes(event.trigger)) continue;
      if (compiled.keywords.length > 0 && !compiled.keywords.some((keyword) => text.includes(keyword))) continue;
      if (compiled.firstMessageOnly && !isFirstMessage) continue;
      return flow;
    }
  }
  return undefined;
}

// ─── Lifecycle CRUD (all mutations go through the state lock) ───

export type FlowCreateInput = {
  brand: BrandKey;
  name: string;
  description?: string;
  nodes: Record<string, FlowNode>;
  entryNodeId: string;
};

export async function createFlow(input: FlowCreateInput, actor = "admin"): Promise<FlowDefinition> {
  if (!input.brand || !input.name?.trim()) throw new Error("brand and name are required");
  if (!input.nodes || !input.entryNodeId || !input.nodes[input.entryNodeId]) {
    throw new Error("nodes and a valid entryNodeId are required");
  }
  const now = new Date().toISOString();
  const flow: FlowDefinition = {
    id: newFlowId(),
    brand: input.brand,
    name: input.name.trim(),
    description: input.description?.trim(),
    status: "draft",
    version: 0,
    nodes: structuredClone(input.nodes),
    entryNodeId: input.entryNodeId,
    compiledTriggers: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
  await mutateState((state) => {
    state.flows[flow.id] = structuredClone(flow);
    addAudit(state, { action: "flow.created", actor, target: flow.id, detail: { name: flow.name } });
  });
  return structuredClone(flow);
}

export async function getFlow(flowId: string): Promise<FlowDefinition | undefined> {
  const flow = (await loadState()).flows[flowId];
  return flow ? structuredClone(flow) : undefined;
}

export async function listFlows(brand?: BrandKey): Promise<ReturnType<typeof summarize>[]> {
  const state = await loadState();
  return Object.values(state.flows)
    .filter((flow) => !brand || flow.brand === brand)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(summarize);
}

function requireEditable(flow: FlowDefinition): void {
  if (flow.status === "published") {
    throw new Error(`flow ${flow.id} is published and immutable; unpublish it before editing`);
  }
}

export async function updateFlow(
  flowId: string,
  patch: { name?: string; description?: string; nodes?: Record<string, FlowNode>; entryNodeId?: string },
  actor = "admin",
): Promise<FlowDefinition> {
  return mutateState((state) => {
    const flow = state.flows[flowId];
    if (!flow) throw new Error(`flow ${flowId} not found`);
    requireEditable(flow);
    if (patch.name?.trim()) flow.name = patch.name.trim();
    if (patch.description !== undefined) flow.description = patch.description?.trim() || undefined;
    if (patch.nodes) {
      const entryId = patch.entryNodeId ?? flow.entryNodeId;
      if (!patch.nodes[entryId]) throw new Error(`entry node "${entryId}" missing from replacement nodes`);
      flow.nodes = structuredClone(patch.nodes);
      flow.entryNodeId = entryId;
    } else if (patch.entryNodeId) {
      if (!flow.nodes[patch.entryNodeId]) throw new Error(`entry node "${patch.entryNodeId}" does not exist`);
      flow.entryNodeId = patch.entryNodeId;
    }
    if (flow.status === "archived") flow.status = "draft";
    flow.updatedAt = new Date().toISOString();
    addAudit(state, { action: "flow.updated", actor, target: flow.id });
    return structuredClone(flow);
  });
}

function snapshotFlow(flow: FlowDefinition, actor: string): FlowVersionSnapshot {
  return {
    version: flow.version,
    publishedAt: flow.publishedAt ?? new Date().toISOString(),
    publishedBy: flow.publishedBy ?? actor,
    nodes: structuredClone(flow.nodes),
    entryNodeId: flow.entryNodeId,
  };
}

export async function publishFlow(flowId: string, actor = "admin"): Promise<FlowDefinition> {
  return mutateState((state) => {
    const flow = state.flows[flowId];
    if (!flow) throw new Error(`flow ${flowId} not found`);
    if (flow.status === "published") throw new Error(`flow ${flowId} is already published`);
    // Wave 7: publish-time allowlist + secret enforcement. The allowlist is
    // checked again at execution time (defense in depth — it can change
    // after publish).
    const http = httpValidationContextFromState(state, flow.brand);
    const validation = validateFlowDefinition(flow.nodes, flow.entryNodeId, { http });
    if (!validation.valid) {
      throw new Error(`flow ${flowId} failed validation: ${validation.errors.join("; ")}`);
    }
    const now = new Date().toISOString();
    flow.version += 1;
    flow.status = "published";
    flow.publishedAt = now;
    flow.publishedBy = actor;
    flow.updatedAt = now;
    flow.compiledTriggers = buildCompiledTriggers(flow);
    flow.versions.push(snapshotFlow(flow, actor));
    if (flow.versions.length > MAX_VERSION_SNAPSHOTS) {
      flow.versions = flow.versions.slice(flow.versions.length - MAX_VERSION_SNAPSHOTS);
    }
    addAudit(state, {
      action: "flow.published",
      actor,
      target: flow.id,
      detail: { version: flow.version, warnings: validation.warnings },
    });
    return structuredClone(flow);
  });
}

export async function unpublishFlow(flowId: string, actor = "admin"): Promise<FlowDefinition> {
  return mutateState((state) => {
    const flow = state.flows[flowId];
    if (!flow) throw new Error(`flow ${flowId} not found`);
    if (flow.status !== "published") throw new Error(`flow ${flowId} is not published`);
    flow.status = "draft";
    flow.compiledTriggers = [];
    flow.updatedAt = new Date().toISOString();
    addAudit(state, { action: "flow.unpublished", actor, target: flow.id, detail: { version: flow.version } });
    return structuredClone(flow);
  });
}

export async function archiveFlow(flowId: string, actor = "admin"): Promise<FlowDefinition> {
  return mutateState((state) => {
    const flow = state.flows[flowId];
    if (!flow) throw new Error(`flow ${flowId} not found`);
    flow.status = "archived";
    flow.compiledTriggers = [];
    flow.updatedAt = new Date().toISOString();
    addAudit(state, { action: "flow.archived", actor, target: flow.id });
    return structuredClone(flow);
  });
}

export async function rollbackFlow(flowId: string, version: number, actor = "admin"): Promise<FlowDefinition> {
  return mutateState((state) => {
    const flow = state.flows[flowId];
    if (!flow) throw new Error(`flow ${flowId} not found`);
    const snapshot = flow.versions.find((entry) => entry.version === version);
    if (!snapshot) throw new Error(`flow ${flowId} has no published version ${version}`);
    const now = new Date().toISOString();
    flow.nodes = structuredClone(snapshot.nodes);
    flow.entryNodeId = snapshot.entryNodeId;
    flow.version += 1;
    flow.status = "published";
    flow.publishedAt = now;
    flow.publishedBy = actor;
    flow.updatedAt = now;
    flow.compiledTriggers = buildCompiledTriggers(flow);
    flow.versions.push(snapshotFlow(flow, actor));
    if (flow.versions.length > MAX_VERSION_SNAPSHOTS) {
      flow.versions = flow.versions.slice(flow.versions.length - MAX_VERSION_SNAPSHOTS);
    }
    addAudit(state, {
      action: "flow.rollback",
      actor,
      target: flow.id,
      detail: { fromVersion: version, toVersion: flow.version },
    });
    return structuredClone(flow);
  });
}

export async function duplicateFlow(flowId: string, actor = "admin"): Promise<FlowDefinition> {
  const source = await getFlow(flowId);
  if (!source) throw new Error(`flow ${flowId} not found`);
  return createFlow(
    {
      brand: source.brand,
      name: `${source.name} (copy)`,
      description: source.description,
      nodes: source.nodes,
      entryNodeId: source.entryNodeId,
    },
    actor,
  );
}

/**
 * Wave 8 (Gemini R2 draft contract): a published flow is never edited
 * in place. The operator clicks "Create Draft", which produces a NEW
 * draft version derived from the published flow's nodes. The live
 * version stays untouched until the draft is explicitly published.
 */
export async function createDraftFromPublished(flowId: string, actor = "admin"): Promise<FlowDefinition> {
  const source = await getFlow(flowId);
  if (!source) throw new Error(`flow ${flowId} not found`);
  if (source.status !== "published") {
    throw new Error(`flow ${flowId} is not published; drafts are created from published flows only`);
  }
  const draft = await createFlow(
    {
      brand: source.brand,
      name: `${source.name} (draft of v${source.version})`,
      description: source.description,
      nodes: source.nodes,
      entryNodeId: source.entryNodeId,
    },
    actor,
  );
  await mutateState((state) => {
    addAudit(state, {
      action: "flow.draft_created",
      actor,
      target: draft.id,
      detail: { sourceFlowId: source.id, sourceVersion: source.version },
    });
  });
  return draft;
}

export async function deleteFlow(flowId: string, actor = "admin"): Promise<void> {
  await mutateState((state) => {
    const flow = state.flows[flowId];
    if (!flow) throw new Error(`flow ${flowId} not found`);
    if (flow.status === "published") throw new Error(`flow ${flowId} is published; unpublish or archive it first`);
    delete state.flows[flowId];
    addAudit(state, { action: "flow.deleted", actor, target: flowId });
  });
}

// ─── Applying run actions to real state (called inside one mutateState) ───

export type ApplyFlowInput = {
  flow: FlowDefinition;
  event: IncomingEvent;
  brand: BrandConfig;
  contactId: string;
  conversationId: string;
  actions: FlowAction[];
  /** false on the test channel: record actions, create no delivery jobs */
  live: boolean;
  traceLength: number;
  stopReason?: string;
  /** Wave 4: this applies a wait-resume traversal, not a fresh trigger */
  resume?: boolean;
};

export function applyFlowActions(
  state: YochatState,
  input: ApplyFlowInput,
): { handoffCreated: boolean; followupsScheduled: number } {
  const contact = state.contacts[input.contactId];
  const conversation = state.conversations[input.conversationId];
  if (!contact || !conversation) return { handoffCreated: false, followupsScheduled: 0 };

  let handoffCreated = false;
  let followupsScheduled = 0;
  const now = new Date();

  addAnalytics(state, {
    brand: input.brand.key,
    channel: input.event.channel,
    name: input.resume ? "flow_resumed" : "flow_triggered",
    contactId: contact.id,
    conversationId: conversation.id,
    metadata: { flowId: input.flow.id, version: input.flow.version, resume: input.resume ?? false },
  });

  for (const action of input.actions) {
    switch (action.kind) {
      case "update_contact":
        for (const tag of action.tags) if (!contact.tags.includes(tag)) contact.tags.push(tag);
        for (const [key, value] of Object.entries(action.fields)) contact.fields[key] = value;
        break;
      case "collect": {
        let captured = false;
        if (action.collected.email && action.collected.email !== contact.email) {
          contact.email = action.collected.email;
          captured = true;
        }
        if (action.collected.phone && action.collected.phone !== contact.phone) {
          contact.phone = action.collected.phone;
          captured = true;
        }
        if (captured) {
          contact.leadStage = "qualified";
          addAnalytics(state, {
            brand: input.brand.key,
            channel: input.event.channel,
            name: "lead_captured",
            contactId: contact.id,
            conversationId: conversation.id,
            metadata: { via: "flow", flowId: input.flow.id },
          });
        }
        break;
      }
      case "handoff": {
        const existing = Object.values(state.handoffs).find(
          (handoff) => handoff.conversationId === conversation.id && handoff.status !== "resolved",
        );
        if (!existing) {
          const handoff = {
            id: randomUUID(),
            conversationId: conversation.id,
            contactId: contact.id,
            brand: contact.brand,
            reason: action.reason,
            status: "open" as const,
            createdAt: now.toISOString(),
          };
          state.handoffs[handoff.id] = handoff;
          contact.automationPaused = true;
          conversation.status = "handoff";
          for (const enrollment of Object.values(state.enrollments)) {
            if (enrollment.contactId === contact.id && enrollment.status === "active") {
              enrollment.status = "cancelled";
            }
          }
          for (const job of Object.values(state.jobs)) {
            if (
              job.brand === contact.brand &&
              job.channel === contact.channel &&
              job.recipientId === contact.externalId &&
              job.kind === "sequence" &&
              (job.status === "pending" || job.status === "processing")
            ) {
              job.status = "cancelled";
              job.lockedAt = undefined;
            }
          }
          addAnalytics(state, {
            brand: contact.brand,
            channel: contact.channel,
            name: "handoff_created",
            contactId: contact.id,
            conversationId: conversation.id,
            metadata: { reason: action.reason, via: "flow", flowId: input.flow.id },
          });
          handoffCreated = true;
        }
        break;
      }
      case "schedule_followup": {
        // Test channel: record only, never schedule a real send.
        if (!input.live) break;
        // Same 23h Meta window guard the sequence scheduler uses.
        const lastInboundAge = now.getTime() - new Date(contact.lastSeenAt).getTime();
        if (lastInboundAge > 23 * 60 * 60 * 1000) break;
        const dueAt = new Date(now.getTime() + action.minutes * 60_000).toISOString();
        const job: DeliveryJob = {
          id: randomUUID(),
          eventId: input.event.id,
          brand: input.brand.key,
          channel: input.event.channel,
          accountId: input.event.accountId,
          recipientId: contact.externalId,
          text: action.text,
          kind: "automated",
          status: "pending",
          attempts: 0,
          dueAt,
          createdAt: now.toISOString(),
          metadata: { flowId: input.flow.id, flowVersion: input.flow.version, nodeId: action.nodeId, flowDelay: true, contactId: contact.id },
        };
        const message: MessageRecord = {
          id: randomUUID(),
          conversationId: conversation.id,
          direction: "outbound",
          text: action.text,
          trigger: input.event.trigger,
          status: "queued",
          createdAt: now.toISOString(),
          metadata: { flowId: input.flow.id, nodeId: action.nodeId },
        };
        state.messages.push(message);
        job.messageId = message.id;
        state.jobs[job.id] = job;
        followupsScheduled += 1;
        break;
      }
      case "send_text":
      case "ai_reply":
        // The reply body is assembled by the engine hook; nothing to persist here.
        break;
      case "http_request":
        // Wave 7: the bounded executor already wrote the audit record and
        // the outcome is in the run trace. Nothing to persist.
        break;
    }
  }

  addAnalytics(state, {
    brand: input.brand.key,
    channel: input.event.channel,
    name: "flow_completed",
    contactId: contact.id,
    conversationId: conversation.id,
    metadata: {
      flowId: input.flow.id,
      version: input.flow.version,
      steps: input.traceLength,
      actions: input.actions.length,
      stopReason: input.stopReason,
      handoffCreated,
      followupsScheduled,
    },
  });

  return { handoffCreated, followupsScheduled };
}

// ─── Wave 4: persistent waits (wait-for-reply sessions) ───

/**
 * Arms a wait on the contact inside an already-locked mutateState block.
 * The run stays paused at the wait node until the contact replies
 * (resume at resumeNodeId) or timeoutAt passes (resume at timeoutNodeId,
 * or the run completes with stopReason "wait_timeout" when unset).
 */
export function armFlowWait(
  state: YochatState,
  input: {
    contactId: string;
    flowId: string;
    flowVersion: number;
    waitNodeId: string;
    resumeNodeId: string;
    timeoutNodeId?: string;
    runId: string;
    timeoutMinutes: number;
    label?: string;
  },
): ActiveFlowWait {
  const contact = state.contacts[input.contactId];
  if (!contact) throw new Error(`contact ${input.contactId} not found`);
  const now = new Date();
  const wait: ActiveFlowWait = {
    flowId: input.flowId,
    flowVersion: input.flowVersion,
    waitNodeId: input.waitNodeId,
    resumeNodeId: input.resumeNodeId,
    timeoutNodeId: input.timeoutNodeId,
    runId: input.runId,
    armedAt: now.toISOString(),
    timeoutAt: new Date(now.getTime() + input.timeoutMinutes * 60_000).toISOString(),
    label: input.label,
  };
  contact.activeFlow = wait;
  addAudit(state, {
    action: "flow.wait_armed",
    actor: "engine",
    target: input.contactId,
    detail: {
      flowId: input.flowId,
      flowVersion: input.flowVersion,
      waitNodeId: input.waitNodeId,
      resumeNodeId: input.resumeNodeId,
      timeoutNodeId: input.timeoutNodeId,
      timeoutAt: wait.timeoutAt,
      label: input.label,
    },
  });
  addAnalytics(state, {
    brand: contact.brand,
    channel: contact.channel,
    name: "flow_wait_armed",
    contactId: contact.id,
    metadata: { flowId: input.flowId, flowVersion: input.flowVersion, timeoutAt: wait.timeoutAt },
  });
  return wait;
}

/** Clears the armed wait (resume, timeout, or zombie-guard rejection). */
export function clearFlowWait(
  state: YochatState,
  contactId: string,
  reason: "resumed" | "timeout" | "stale" | "superseded",
  detail?: Record<string, unknown>,
): void {
  const contact = state.contacts[contactId];
  if (!contact?.activeFlow) return;
  const wait = contact.activeFlow;
  delete contact.activeFlow;
  addAudit(state, {
    action: "flow.wait_cleared",
    actor: "engine",
    target: contactId,
    detail: { reason, flowId: wait.flowId, flowVersion: wait.flowVersion, waitNodeId: wait.waitNodeId, ...detail },
  });
}

/** Pinned snapshot lookup: the resume runs the version armed, never the live flow. */
export function getPinnedSnapshot(flow: FlowDefinition, version: number): FlowVersionSnapshot | undefined {
  return flow.versions.find((snapshot) => snapshot.version === version);
}

export type WaitFreshness =
  | { ok: true; flow: FlowDefinition; snapshot: FlowVersionSnapshot }
  | { ok: false; reason: string };

/**
 * Zombie-guard for wait resumption (inbound or timeout). A wait may only
 * resume when the flow still exists AND the pinned version snapshot still
 * exists AND the armed wait node is still part of that snapshot. Anything
 * else is a zombie: the wait is stale and must be cleared, never resumed.
 */
export function assertWaitFresh(state: YochatState, wait: ActiveFlowWait): WaitFreshness {
  const flow = state.flows[wait.flowId];
  if (!flow) return { ok: false, reason: `flow ${wait.flowId} no longer exists` };
  const snapshot = getPinnedSnapshot(flow, wait.flowVersion);
  if (!snapshot) {
    return { ok: false, reason: `flow ${wait.flowId} version ${wait.flowVersion} snapshot is gone (version history trimmed?)` };
  }
  const waitNode = snapshot.nodes[wait.waitNodeId];
  if (!waitNode || waitNode.type !== "wait") {
    return { ok: false, reason: `wait node ${wait.waitNodeId} is not a wait node in the pinned snapshot` };
  }
  if (!snapshot.nodes[wait.resumeNodeId]) {
    return { ok: false, reason: `resume node ${wait.resumeNodeId} is missing from the pinned snapshot` };
  }
  return { ok: true, flow, snapshot };
}

/** Contacts whose armed wait has timed out, for the cron sweeper. */
export function listDueFlowWaits(
  state: YochatState,
  now: Date = new Date(),
): Array<{ contactId: string; wait: ActiveFlowWait }> {
  const due: Array<{ contactId: string; wait: ActiveFlowWait }> = [];
  for (const contact of Object.values(state.contacts)) {
    const wait = contact.activeFlow;
    if (wait && new Date(wait.timeoutAt).getTime() <= now.getTime()) {
      due.push({ contactId: contact.id, wait: structuredClone(wait) });
    }
  }
  return due;
}
