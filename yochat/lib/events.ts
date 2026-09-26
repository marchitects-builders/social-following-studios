import { redisCommand, redisConfigured } from "@/lib/redis";
import type { IncomingEvent } from "@/lib/types";

/**
 * Webhook event ledger (Wave 1).
 *
 * Every verified inbound Meta event is recorded here BEFORE processing:
 * raw normalized event + status + outcome. This gives replayability,
 * debugging, and an audit trail that the old `processedEventIds` set
 * (dedupe only, no payload) could not provide.
 *
 * Redis layout:
 *   yochat:webhook-event:<eventId>  -> hash { eventId, channel, receivedAt, status, outcome?, finishedAt?, event }
 *   yochat:webhook-events           -> list of eventIds (newest first, capped at 500)
 * TTL: 48h per event hash.
 */

export type WebhookEventStatus = "received" | "processing" | "processed" | "failed";

export type WebhookEventRecord = {
  eventId: string;
  channel: string;
  receivedAt: string;
  status: WebhookEventStatus;
  outcome?: string;
  finishedAt?: string;
  event: IncomingEvent;
};

const KEY_PREFIX = "yochat:webhook-event:";
const INDEX_KEY = "yochat:webhook-events";
const EVENT_TTL_SECONDS = 48 * 60 * 60;
const INDEX_CAP = 500;

type MemoryGlobal = typeof globalThis & {
  __yochatEventLedger?: Map<string, WebhookEventRecord>;
  __yochatEventIndex?: string[];
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}

function memoryLedger(): Map<string, WebhookEventRecord> {
  const global = memoryGlobal();
  global.__yochatEventLedger ??= new Map();
  return global.__yochatEventLedger;
}

function memoryIndex(): string[] {
  const global = memoryGlobal();
  global.__yochatEventIndex ??= [];
  return global.__yochatEventIndex;
}

function serialize(record: WebhookEventRecord): Record<string, string> {
  return {
    eventId: record.eventId,
    channel: record.channel,
    receivedAt: record.receivedAt,
    status: record.status,
    outcome: record.outcome ?? "",
    finishedAt: record.finishedAt ?? "",
    event: JSON.stringify(record.event),
  };
}

function deserialize(fields: Record<string, string>): WebhookEventRecord | undefined {
  if (!fields.eventId || !fields.event) return undefined;
  return {
    eventId: fields.eventId,
    channel: fields.channel,
    receivedAt: fields.receivedAt,
    status: (fields.status as WebhookEventStatus) ?? "received",
    outcome: fields.outcome || undefined,
    finishedAt: fields.finishedAt || undefined,
    event: JSON.parse(fields.event) as IncomingEvent,
  };
}

export async function recordWebhookEvent(event: IncomingEvent): Promise<WebhookEventRecord> {
  const record: WebhookEventRecord = {
    eventId: event.id,
    channel: event.channel,
    receivedAt: new Date().toISOString(),
    status: "received",
    event,
  };

  if (!redisConfigured()) {
    const ledger = memoryLedger();
    const index = memoryIndex();
    const existed = ledger.has(event.id);
    ledger.set(event.id, record);
    if (!existed) {
      index.unshift(event.id);
      while (index.length > INDEX_CAP) {
        const dropped = index.pop();
        if (dropped) ledger.delete(dropped);
      }
    }
    return record;
  }

  await redisCommand(["HSET", KEY_PREFIX + event.id, ...Object.entries(serialize(record)).flat()]);
  await redisCommand(["EXPIRE", KEY_PREFIX + event.id, EVENT_TTL_SECONDS]);
  await redisCommand(["LPUSH", INDEX_KEY, event.id]);
  await redisCommand(["LTRIM", INDEX_KEY, 0, INDEX_CAP - 1]);
  await redisCommand(["EXPIRE", INDEX_KEY, EVENT_TTL_SECONDS]);
  return record;
}

export async function getWebhookEvent(eventId: string): Promise<WebhookEventRecord | undefined> {
  if (!redisConfigured()) return memoryLedger().get(eventId);

  const fields = await redisCommand<Record<string, string>>(["HGETALL", KEY_PREFIX + eventId]);
  if (!fields || Object.keys(fields).length === 0) return undefined;
  return deserialize(fields);
}

export async function updateWebhookEvent(
  eventId: string,
  patch: { status: WebhookEventStatus; outcome?: string },
): Promise<void> {
  const finishedAt = patch.status === "processed" || patch.status === "failed" ? new Date().toISOString() : "";

  if (!redisConfigured()) {
    const existing = memoryLedger().get(eventId);
    if (!existing) return;
    existing.status = patch.status;
    if (patch.outcome !== undefined) existing.outcome = patch.outcome;
    if (finishedAt) existing.finishedAt = finishedAt;
    return;
  }

  const updates: string[] = ["status", patch.status];
  if (patch.outcome !== undefined) updates.push("outcome", patch.outcome);
  if (finishedAt) updates.push("finishedAt", finishedAt);
  await redisCommand(["HSET", KEY_PREFIX + eventId, ...updates]);
}

export async function getRecentWebhookEvents(limit = 50): Promise<WebhookEventRecord[]> {
  const capped = Math.min(200, Math.max(1, limit));

  if (!redisConfigured()) {
    return memoryIndex()
      .slice(0, capped)
      .map((id) => memoryLedger().get(id))
      .filter((record): record is WebhookEventRecord => Boolean(record));
  }

  const ids = await redisCommand<string[]>(["LRANGE", INDEX_KEY, 0, capped - 1]);
  const records: WebhookEventRecord[] = [];
  for (const id of ids) {
    const record = await getWebhookEvent(id);
    if (record) records.push(record);
  }
  return records;
}

/** Redact the stored event payload for admin display (sender IDs stay — that's the point of the ledger). */
export function summarizeWebhookEvent(record: WebhookEventRecord): Omit<WebhookEventRecord, "event"> & {
  textPreview: string;
} {
  const { event, ...rest } = record;
  return { ...rest, textPreview: event.text.slice(0, 120) };
}
