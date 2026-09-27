import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { processIncomingEvent } from "@/lib/engine";
import { recordWebhookEvent, updateWebhookEvent } from "@/lib/events";
import { processDueJobs } from "@/lib/jobs";
import { heartbeat, logOps } from "@/lib/ops";
import type { DeliveryJob, EngineResult, IncomingEvent, TriggerType } from "@/lib/types";

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
    quick_reply?: { payload?: string };
    reply_to?: { mid?: string; story?: { id?: string; url?: string } };
  };
  postback?: { mid?: string; title?: string; payload?: string; referral?: { ref?: string } };
  referral?: { ref?: string; source?: string; type?: string };
  optin?: { ref?: string };
};

type ChangeEvent = {
  field?: string;
  value?: {
    id?: string;
    comment_id?: string;
    media_id?: string;
    text?: string;
    from?: { id?: string; username?: string };
    user_id?: string;
    username?: string;
    media?: { id?: string };
  };
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessagingEvent[];
    changes?: ChangeEvent[];
  }>;
};

export function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return secureEqual(signatureHeader, expected);
}

function stableEventId(prefix: string, value: unknown): string {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32)}`;
}

function safeTimestamp(value: number | undefined): string {
  const now = Date.now();
  const milliseconds = value ? value * (value < 10_000_000_000 ? 1000 : 1) : now;
  const normalized = Number.isFinite(milliseconds) && milliseconds > now - 30 * 24 * 60 * 60 * 1000 && milliseconds < now + 5 * 60_000
    ? milliseconds
    : now;
  return new Date(normalized).toISOString();
}

function configuredAccountIds(environmentName: string): Set<string> {
  const encodedMap = process.env[environmentName];
  if (!encodedMap) return new Set();
  try {
    const parsed: unknown = JSON.parse(encodedMap);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return new Set(Object.keys(parsed));
  } catch {
    return new Set();
  }
  return new Set();
}

function messagingTrigger(event: MessagingEvent): TriggerType {
  if (event.optin) return "follow";
  if (event.postback) return "postback";
  if (event.referral) return "referral";
  if (event.message?.reply_to?.story) return "story_reply";
  return "message";
}

/** Coerce an unknown value to string, or undefined when it is not a string. */
function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function messagingText(event: MessagingEvent): string {
  // Webhook War (WH-01): every text source is type-guarded so a malformed
  // (but validly signed) payload can never throw inside extraction.
  const attachments = Array.isArray(event.message?.attachments)
    ? event.message.attachments.map((attachment) => `[${asText(attachment?.type) ?? "attachment"}]`).join(" ")
    : undefined;
  return (
    asText(event.message?.text) ??
    asText(event.message?.quick_reply?.payload) ??
    asText(event.postback?.title) ??
    asText(event.postback?.payload) ??
    asText(event.optin?.ref) ??
    asText(event.referral?.ref) ??
    asText(event.postback?.referral?.ref) ??
    attachments ??
    ""
  ).trim();
}

export function extractIncomingEvents(payload: MetaWebhookPayload): IncomingEvent[] {
  // Webhook War (WH-01): never throw on a malformed payload. Only Meta can
  // produce a valid signature, but Meta itself can misdeliver; a 500 here
  // would trigger pointless Meta retries, so malformed entries are skipped.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  if (payload.object !== "page" && payload.object !== "instagram") return [];
  const channel = payload.object === "instagram" ? "instagram" : "messenger";
  const automatedAccountIds = configuredAccountIds(
    channel === "instagram" ? "META_INSTAGRAM_ACCESS_TOKENS_JSON" : "META_PAGE_ACCESS_TOKENS_JSON",
  );
  const events: IncomingEvent[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const messagingList = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const messaging of messagingList) {
      if (!messaging || typeof messaging !== "object" || Array.isArray(messaging)) continue;
      const accountId = asText(entry.id) ?? asText(messaging.recipient?.id);
      const senderId = asText(messaging.sender?.id);
      const text = messagingText(messaging);
      const isControlledTest = text === "Yochat test: say READY";
      if (!accountId || !senderId || !text || messaging.message?.is_echo) continue;
      if (automatedAccountIds.has(senderId) && !isControlledTest) continue;
      const timestamp = messaging.timestamp ?? entry.time ?? Date.now();
      const id =
        asText(messaging.message?.mid) ??
        asText(messaging.postback?.mid) ??
        stableEventId(channel, { accountId, senderId, timestamp, text });
      events.push({
        id,
        channel,
        accountId,
        senderId,
        trigger: messagingTrigger(messaging),
        text: text.slice(0, 4000),
        timestamp: safeTimestamp(timestamp),
        referral: asText(messaging.referral?.ref) ?? asText(messaging.postback?.referral?.ref) ?? asText(messaging.optin?.ref),
        metadata: {
          quickReply: asText(messaging.message?.quick_reply?.payload),
          attachments: Array.isArray(messaging.message?.attachments) ? messaging.message.attachments : undefined,
          source: asText(messaging.referral?.source),
        },
      });
    }

    const igAccountId = asText(entry.id);
    if (channel !== "instagram" || !igAccountId) continue;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== "object" || Array.isArray(change)) continue;
      if (!change.field || !["comments", "live_comments", "mentions"].includes(change.field)) continue;
      const value = change.value;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const senderId = asText(value?.from?.id) ?? asText(value?.user_id);
      const commentId = asText(value?.id) ?? asText(value?.comment_id);
      const text = asText(value?.text)?.trim();
      if (!senderId || !commentId || !text) continue;
      events.push({
        id: `comment:${commentId}`,
        channel: "instagram",
        accountId: igAccountId,
        senderId,
        trigger: change.field === "mentions" ? "mention" : "comment",
        text: text.slice(0, 4000),
        timestamp: safeTimestamp(entry.time),
        commentId,
        mediaId: asText(value?.media?.id) ?? asText(value?.media_id),
        username: asText(value?.from?.username) ?? asText(value?.username),
        metadata: { webhookField: change.field },
      });
    }
  }
  return events;
}

function tokenFromMap(environmentName: string, accountId: string): string | undefined {
  const encodedMap = process.env[environmentName];
  if (!encodedMap) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedMap);
  } catch {
    throw new Error(`${environmentName} must be valid JSON`);
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const token = (parsed as Record<string, unknown>)[accountId];
    if (typeof token === "string" && token.length > 0) return token;
  }
  return undefined;
}

function pageTokenFor(pageId: string): string {
  const mapped = tokenFromMap("META_PAGE_ACCESS_TOKENS_JSON", pageId);
  if (mapped) return mapped;
  if (process.env.META_PAGE_ACCESS_TOKEN) return process.env.META_PAGE_ACCESS_TOKEN;
  throw new Error(`No Page access token is configured for Page ${pageId}`);
}

function instagramTokenFor(accountId: string): string {
  const mapped = tokenFromMap("META_INSTAGRAM_ACCESS_TOKENS_JSON", accountId);
  if (mapped) return mapped;
  if (process.env.META_INSTAGRAM_ACCESS_TOKEN) return process.env.META_INSTAGRAM_ACCESS_TOKEN;
  throw new Error(`No Instagram access token is configured for account ${accountId}`);
}

function truncateUtf8(text: string, maximumBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maximumBytes) return text;
  let result = "";
  for (const character of text) {
    if (Buffer.byteLength(result + character, "utf8") > maximumBytes) break;
    result += character;
  }
  return result;
}

async function sendMessengerJob(job: DeliveryJob): Promise<void> {
  const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v26.0";
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageTokenFor(job.accountId)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_type: "RESPONSE", recipient: { id: job.recipientId }, message: { text: job.text.slice(0, 2000) } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Meta Send API returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

async function sendInstagramJob(job: DeliveryJob): Promise<void> {
  const graphVersion = process.env.META_INSTAGRAM_GRAPH_API_VERSION ?? "v25.0";
  const response = await fetch(`https://graph.instagram.com/${graphVersion}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${instagramTokenFor(job.accountId)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: job.commentId ? { comment_id: job.commentId } : { id: job.recipientId },
      message: { text: truncateUtf8(job.text, 1000) },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Instagram Send API returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

export async function deliverMetaJob(job: DeliveryJob): Promise<void> {
  // Gemini R3: LLM/control-character injection guard — sanitize every
  // outbound payload before it touches the Graph API.
  const sanitized: DeliveryJob = { ...job, text: sanitizeOutboundText(job.text) };
  if (sanitized.channel === "instagram") return sendInstagramJob(sanitized);
  if (sanitized.channel === "messenger") return sendMessengerJob(sanitized);
  throw new Error(`Cannot deliver a ${sanitized.channel} job through Meta`);
}

/**
 * Strip control characters that can corrupt the Graph API JSON payload
 * (or smuggle LLM output artifacts into a send), preserving \n and \t.
 */
export function sanitizeOutboundText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export async function processMetaWebhook(payload: MetaWebhookPayload): Promise<EngineResult[]> {
  const results: EngineResult[] = [];
  await heartbeat("ingest");
  for (const event of extractIncomingEvents(payload)) {
    const record = await recordWebhookEvent(event);
    try {
      await updateWebhookEvent(record.eventId, { status: "processing" });
      const result = await processIncomingEvent(event);
      results.push(result);
      await updateWebhookEvent(record.eventId, {
        status: "processed",
        outcome: result.ignored ? "ignored" : result.intent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await updateWebhookEvent(record.eventId, { status: "failed", outcome: message.slice(0, 300) });
      await logOps("error", "ingest", "Yochat event failed", {
        eventId: event.id,
        channel: event.channel,
        error: message.slice(0, 300),
      });
    }
  }
  await processDueJobs(deliverMetaJob);
  return results;
}
