import { randomUUID } from "node:crypto";
import { redisCommand, redisConfigured } from "@/lib/redis";
import type { FlowRunRecord, FlowRunStep } from "@/lib/types";
import type { FlowAction, FlowRunResult } from "@/lib/flow-runner";

/**
 * Wave 2 (advisor round 2) — flow execution records ("causality").
 *
 * Answers "why did this person receive this message?" Every live flow run
 * is recorded with its pinned flow version, node trace, and actions.
 * Stored OUTSIDE the main state blob (same keyed pattern as the webhook
 * event ledger) so run history never contributes to blob write amplification.
 *
 * Redis layout:
 *   yochat:flowrun:<runId>  -> hash of the record (7-day TTL)
 *   yochat:flowruns          -> list of runIds (newest first, capped at 500)
 *   yochat:flowruns:contact:<contactId> -> list of runIds (newest first, capped at 100)
 */

const KEY_PREFIX = "yochat:flowrun:";
const INDEX_KEY = "yochat:flowruns";
const CONTACT_INDEX_PREFIX = "yochat:flowruns:contact:";
const RUN_TTL_SECONDS = 7 * 24 * 60 * 60;
const INDEX_CAP = 500;
const CONTACT_INDEX_CAP = 100;

type MemoryGlobal = typeof globalThis & {
  __yochatFlowRuns?: Map<string, FlowRunRecord>;
  __yochatFlowRunIndex?: string[];
  __yochatFlowRunContactIndex?: Map<string, string[]>;
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}

function memoryRuns(): Map<string, FlowRunRecord> {
  const global = memoryGlobal();
  global.__yochatFlowRuns ??= new Map();
  return global.__yochatFlowRuns;
}

function memoryIndex(): string[] {
  const global = memoryGlobal();
  global.__yochatFlowRunIndex ??= [];
  return global.__yochatFlowRunIndex;
}

function memoryContactIndex(): Map<string, string[]> {
  const global = memoryGlobal();
  global.__yochatFlowRunContactIndex ??= new Map();
  return global.__yochatFlowRunContactIndex;
}

function pushCapped(list: string[], id: string, cap: number): void {
  list.unshift(id);
  while (list.length > cap) list.pop();
}

function actionSummary(action: FlowAction): { kind: string; nodeId: string; detail?: string } {
  switch (action.kind) {
    case "send_text":
    case "ai_reply":
      return { kind: action.kind, nodeId: action.nodeId, detail: action.text.slice(0, 120) };
    case "update_contact":
      return { kind: action.kind, nodeId: action.nodeId, detail: `tags=${action.tags.length} fields=${Object.keys(action.fields).length}` };
    case "collect":
      return { kind: action.kind, nodeId: action.nodeId, detail: Object.keys(action.collected).join(",") };
    case "schedule_followup":
      return { kind: action.kind, nodeId: action.nodeId, detail: `+${action.minutes}min` };
    case "handoff":
      return { kind: action.kind, nodeId: action.nodeId, detail: action.reason };
    case "http_request":
      // Wave 7: method + host + outcome only — never query strings, bodies, or secret values.
      return {
        kind: action.kind,
        nodeId: action.nodeId,
        detail: `${action.outcome.method} ${action.outcome.host} → ${action.outcome.outcome}${action.outcome.status !== undefined ? ` ${action.outcome.status}` : ""}`,
      };
  }
}

function serialize(record: FlowRunRecord): Record<string, string> {
  return {
    id: record.id,
    flowId: record.flowId,
    flowVersion: String(record.flowVersion),
    brand: record.brand,
    contactId: record.contactId,
    conversationId: record.conversationId,
    eventId: record.eventId,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt ?? "",
    stopReason: record.stopReason ?? "",
    steps: JSON.stringify(record.steps),
    actions: JSON.stringify(record.actions),
    replyPreview: record.replyPreview ?? "",
  };
}

function deserialize(fields: Record<string, string>): FlowRunRecord | undefined {
  if (!fields.id || !fields.flowId) return undefined;
  return {
    id: fields.id,
    flowId: fields.flowId,
    flowVersion: Number(fields.flowVersion) || 0,
    brand: fields.brand as FlowRunRecord["brand"],
    contactId: fields.contactId,
    conversationId: fields.conversationId,
    eventId: fields.eventId,
    status: (fields.status as FlowRunRecord["status"]) ?? "started",
    startedAt: fields.startedAt,
    completedAt: fields.completedAt || undefined,
    stopReason: fields.stopReason || undefined,
    steps: JSON.parse(fields.steps || "[]") as FlowRunStep[],
    actions: JSON.parse(fields.actions || "[]") as FlowRunRecord["actions"],
    replyPreview: fields.replyPreview || undefined,
  };
}

export type FlowRunInput = {
  flowId: string;
  flowVersion: number;
  brand: FlowRunRecord["brand"];
  contactId: string;
  conversationId: string;
  eventId: string;
};

export async function startFlowRun(input: FlowRunInput): Promise<FlowRunRecord> {
  const record: FlowRunRecord = {
    id: `run_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    ...input,
    status: "started",
    startedAt: new Date().toISOString(),
    steps: [],
    actions: [],
  };

  if (!redisConfigured()) {
    memoryRuns().set(record.id, record);
    pushCapped(memoryIndex(), record.id, INDEX_CAP);
    const contactList = memoryContactIndex().get(record.contactId) ?? [];
    pushCapped(contactList, record.id, CONTACT_INDEX_CAP);
    memoryContactIndex().set(record.contactId, contactList);
    return record;
  }

  await redisCommand(["HSET", KEY_PREFIX + record.id, ...Object.entries(serialize(record)).flat()]);
  await redisCommand(["EXPIRE", KEY_PREFIX + record.id, RUN_TTL_SECONDS]);
  await redisCommand(["LPUSH", INDEX_KEY, record.id]);
  await redisCommand(["LTRIM", INDEX_KEY, 0, INDEX_CAP - 1]);
  await redisCommand(["EXPIRE", INDEX_KEY, RUN_TTL_SECONDS]);
  const contactKey = CONTACT_INDEX_PREFIX + record.contactId;
  await redisCommand(["LPUSH", contactKey, record.id]);
  await redisCommand(["LTRIM", contactKey, 0, CONTACT_INDEX_CAP - 1]);
  await redisCommand(["EXPIRE", contactKey, RUN_TTL_SECONDS]);
  return record;
}

export async function completeFlowRun(
  runId: string,
  result: Pick<FlowRunResult, "trace" | "actions" | "stopReason" | "reply">,
): Promise<void> {
  const steps: FlowRunStep[] = result.trace.map((step) => ({ ...step, at: new Date().toISOString() }));
  const actions = result.actions.map(actionSummary);
  const completedAt = new Date().toISOString();

  if (!redisConfigured()) {
    const existing = memoryRuns().get(runId);
    if (!existing) return;
    existing.status = "completed";
    existing.completedAt = completedAt;
    existing.stopReason = result.stopReason;
    existing.steps = steps;
    existing.actions = actions;
    existing.replyPreview = result.reply?.slice(0, 200);
    return;
  }

  await redisCommand([
    "HSET",
    KEY_PREFIX + runId,
    "status",
    "completed",
    "completedAt",
    completedAt,
    "stopReason",
    result.stopReason ?? "",
    "steps",
    JSON.stringify(steps),
    "actions",
    JSON.stringify(actions),
    "replyPreview",
    result.reply?.slice(0, 200) ?? "",
  ]);
}

export async function getFlowRun(runId: string): Promise<FlowRunRecord | undefined> {
  if (!redisConfigured()) return memoryRuns().get(runId);
  const fields = await redisCommand<Record<string, string>>(["HGETALL", KEY_PREFIX + runId]);
  if (!fields || Object.keys(fields).length === 0) return undefined;
  return deserialize(fields);
}

async function idsFor(indexKey: string, limit: number): Promise<string[]> {
  const capped = Math.min(200, Math.max(1, limit));
  if (!redisConfigured()) {
    const memoryList =
      indexKey === INDEX_KEY ? memoryIndex() : (memoryContactIndex().get(indexKey.slice(CONTACT_INDEX_PREFIX.length)) ?? []);
    return memoryList.slice(0, capped);
  }
  return redisCommand<string[]>(["LRANGE", indexKey, 0, capped - 1]);
}

export async function listFlowRuns(limit = 50): Promise<FlowRunRecord[]> {
  const ids = await idsFor(INDEX_KEY, limit);
  const records: FlowRunRecord[] = [];
  for (const id of ids) {
    const record = await getFlowRun(id);
    if (record) records.push(record);
  }
  return records;
}

export async function listFlowRunsForContact(contactId: string, limit = 50): Promise<FlowRunRecord[]> {
  const ids = await idsFor(CONTACT_INDEX_PREFIX + contactId, limit);
  const records: FlowRunRecord[] = [];
  for (const id of ids) {
    const record = await getFlowRun(id);
    if (record) records.push(record);
  }
  return records;
}

// ─── Wave 4: wait/resume lifecycle ───

/** Marks a run as paused at a wait node. Merges with the existing trace so a
 *  resumed-then-rearmed run keeps its full causality story. */
export async function markFlowRunWaiting(
  runId: string,
  result: Pick<FlowRunResult, "trace" | "actions">,
): Promise<void> {
  const now = new Date().toISOString();
  const newSteps: FlowRunStep[] = result.trace.map((step) => ({ ...step, at: now }));
  const newActions = result.actions.map(actionSummary);
  if (!redisConfigured()) {
    const existing = memoryRuns().get(runId);
    if (!existing) return;
    existing.status = "waiting";
    existing.steps = [...existing.steps, ...newSteps];
    existing.actions = [...existing.actions, ...newActions];
    return;
  }
  const existing = await getFlowRun(runId);
  if (!existing) return;
  await redisCommand([
    "HSET",
    KEY_PREFIX + runId,
    "status",
    "waiting",
    "steps",
    JSON.stringify([...existing.steps, ...newSteps]),
    "actions",
    JSON.stringify([...existing.actions, ...newActions]),
  ]);
  await redisCommand(["EXPIRE", KEY_PREFIX + runId, RUN_TTL_SECONDS]);
}

/**
 * Appends a resume traversal to an existing run record and completes it.
 * Preserves the full causality story: arming trace + resume trace.
 */
export async function appendAndCompleteFlowRun(
  runId: string,
  result: Pick<FlowRunResult, "trace" | "actions" | "stopReason" | "reply">,
): Promise<void> {
  const now = new Date().toISOString();
  const newSteps: FlowRunStep[] = result.trace.map((step) => ({ ...step, at: now }));
  const newActions = result.actions.map(actionSummary);
  if (!redisConfigured()) {
    const existing = memoryRuns().get(runId);
    if (!existing) return;
    existing.status = "completed";
    existing.completedAt = now;
    existing.stopReason = result.stopReason;
    existing.steps = [...existing.steps, ...newSteps];
    existing.actions = [...existing.actions, ...newActions];
    if (result.reply) existing.replyPreview = result.reply.slice(0, 200);
    return;
  }
  const existing = await getFlowRun(runId);
  if (!existing) return;
  const steps = [...existing.steps, ...newSteps];
  const actions = [...existing.actions, ...newActions];
  await redisCommand([
    "HSET",
    KEY_PREFIX + runId,
    "status",
    "completed",
    "completedAt",
    now,
    "stopReason",
    result.stopReason ?? "",
    "steps",
    JSON.stringify(steps),
    "actions",
    JSON.stringify(actions),
    "replyPreview",
    result.reply?.slice(0, 200) ?? existing.replyPreview ?? "",
  ]);
  await redisCommand(["EXPIRE", KEY_PREFIX + runId, RUN_TTL_SECONDS]);
}
