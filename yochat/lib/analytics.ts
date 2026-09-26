import { redisCommand, redisConfigured } from "@/lib/redis";
import { loadState } from "@/lib/store";
import { getAiUsage, ESTIMATED_COST_PER_1K_TOKENS_USD } from "@/lib/ai-budget";
import { listFlowRuns } from "@/lib/flowruns";
import { classifySendError, type SendErrorClass } from "@/lib/send-errors";
import type { BrandKey } from "@/lib/types";

/**
 * Wave 6 — brand-level operational analytics.
 *
 * Computed ON DEMAND from existing TTL'd sources, never stored in the state
 * blob: the webhook-event TTLs (lib/events.ts), flow-run records (7d TTL,
 * lib/flowruns.ts), ops log (7d TTL, lib/ops.ts), per-day AI usage keys
 * (expire at UTC midnight, lib/ai-budget.ts), and the pruned state arrays
 * (messages/analytics/jobs, retention-bounded, lib/store.ts).
 *
 * The only thing Wave 6 writes is a bounded per-brand daily AI-usage
 * history series (`yochat:ai:history:<brand>:<yyyy-mm-dd>`, 30-day TTL, one
 * small key per brand per day) so the 7d/30d windows can aggregate AI cost
 * beyond today's accounting key. See RETENTION POLICY at the bottom.
 *
 * Sources per metric:
 * - inbound conversations: conversations created in window
 * - messages in/out: message records in window (internal excluded)
 * - AI vs rule replies: outbound messages — AI replies carry
 *   metadata.aiProvider (stamped by finalizeReply, Wave 5)
 * - flow starts/completions: flow-run records in window
 * - handoffs: handoff records (created in window; open is point-in-time)
 * - opt-outs / leads: analytics ledger events (opt_out / lead_captured)
 * - delivery failures: failed delivery jobs, error class from
 *   classifySendError (Wave 1 lib/send-errors.ts)
 * - AI tokens/cost: daily usage accounting (lib/ai-budget.ts) via the
 *   history series; 24h = today's key, 7d/30d = sum of daily snapshots
 */

export type AnalyticsWindow = "24h" | "7d" | "30d";

export const ANALYTICS_WINDOWS: AnalyticsWindow[] = ["24h", "7d", "30d"];

const WINDOW_MS: Record<AnalyticsWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const WINDOW_DAYS: Record<AnalyticsWindow, number> = { "24h": 1, "7d": 7, "30d": 30 };

const BRAND_KEYS: BrandKey[] = ["marchitects", "social-following", "aafc"];

/** UTC date convention matches lib/ai-budget.ts (yyyy-mm-dd). */
function utcDate(when = new Date()): string {
  return when.toISOString().slice(0, 10);
}

export type BrandAnalytics = {
  brand: BrandKey;
  window: AnalyticsWindow;
  generatedAt: string;
  conversations: { inbound: number };
  messages: { inbound: number; outbound: number; aiReplies: number; ruleReplies: number };
  flows: { starts: number; completions: number; completionRate: number | null };
  handoffs: { created: number; open: number };
  optOuts: number;
  leads: { captured: number };
  ai: { tokens: number; calls: number; costUsd: number; daysWithData: number };
  deliveryFailures: { total: number; byClass: Record<SendErrorClass, number> };
  costPerConversationUsd: number | null;
  costPerLeadUsd: number | null;
};

// ─── Daily AI-usage history series (the only Wave 6 write) ───

const AI_HISTORY_PREFIX = "yochat:ai:history:";
const AI_HISTORY_TTL_SECONDS = 30 * 24 * 60 * 60;

type AiDayRecord = { date: string; inputTokens: number; outputTokens: number; calls: number };

type MemoryGlobal = typeof globalThis & {
  __yochatAiHistory?: Map<string, AiDayRecord>;
};

function memoryHistory(): Map<string, AiDayRecord> {
  const global = globalThis as MemoryGlobal;
  global.__yochatAiHistory ??= new Map();
  return global.__yochatAiHistory;
}

function aiHistoryKey(brand: BrandKey, date: string): string {
  return `${AI_HISTORY_PREFIX}${brand}:${date}`;
}

/**
 * Snapshots today's cumulative AI usage into the history series. Called
 * lazily by getBrandAnalytics — the history backfills the first time the
 * operator views analytics each day. Bounded: one small key per brand per
 * day, 30-day TTL (memory fallback prunes keys older than 40 days).
 */
export async function snapshotDailyAiUsage(brand: BrandKey): Promise<AiDayRecord> {
  const usage = await getAiUsage(brand);
  const record: AiDayRecord = { date: utcDate(), ...usage };
  const key = aiHistoryKey(brand, record.date);

  if (!redisConfigured()) {
    const history = memoryHistory();
    history.set(key, record);
    const cutoff = utcDate(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));
    for (const existing of history.keys()) {
      const datePart = existing.split(":").pop() ?? "";
      if (datePart < cutoff) history.delete(existing);
    }
    return record;
  }

  await redisCommand(["SET", key, JSON.stringify(record), "EX", AI_HISTORY_TTL_SECONDS]);
  return record;
}

async function getAiUsageForWindow(
  brand: BrandKey,
  window: AnalyticsWindow,
): Promise<{ tokens: number; calls: number; daysWithData: number }> {
  await snapshotDailyAiUsage(brand);
  const days = WINDOW_DAYS[window];
  let tokens = 0;
  let calls = 0;
  let daysWithData = 0;

  for (let back = 0; back < days; back += 1) {
    const date = utcDate(new Date(Date.now() - back * 24 * 60 * 60 * 1000));
    const key = aiHistoryKey(brand, date);
    let record: AiDayRecord | undefined;
    if (redisConfigured()) {
      const raw = await redisCommand<string | null>(["GET", key]);
      if (raw) {
        try {
          record = JSON.parse(raw) as AiDayRecord;
        } catch {
          record = undefined;
        }
      }
    } else {
      record = memoryHistory().get(key);
    }
    if (record) {
      tokens += record.inputTokens + record.outputTokens;
      calls += record.calls;
      daysWithData += 1;
    }
  }
  return { tokens, calls, daysWithData };
}

/**
 * Cost model (Wave 6): estimated USD = (tokens / 1000) × the Wave 5 per-1k
 * estimate. The rate is a rough hosted-Llama estimate — reported as an
 * ESTIMATE, not a bill. Single source of truth lives in lib/ai-budget.ts.
 */
export function estimateAiCostUsd(tokens: number): number {
  return Number((((tokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD).toFixed(6)));
}

export function isAnalyticsWindow(value: unknown): value is AnalyticsWindow {
  return value === "24h" || value === "7d" || value === "30d";
}

export function isBrandKey(value: unknown): value is BrandKey {
  return (BRAND_KEYS as unknown[]).includes(value);
}

/**
 * Per-brand rollup for one window. Pure aggregation over TTL'd sources —
 * no state-blob writes (the daily AI snapshot above is keyed storage).
 */
export async function getBrandAnalytics(brand: BrandKey, window: AnalyticsWindow): Promise<BrandAnalytics> {
  const cutoff = Date.now() - WINDOW_MS[window];
  const inWindow = (iso: string | undefined): boolean =>
    typeof iso === "string" && new Date(iso).getTime() >= cutoff;

  const [state, flowRuns, ai] = await Promise.all([
    loadState(),
    listFlowRuns(500),
    getAiUsageForWindow(brand, window),
  ]);

  const brandConversations = Object.values(state.conversations).filter(
    (conversation) => conversation.brand === brand,
  );
  const conversationIds = new Set(brandConversations.map((conversation) => conversation.id));
  const inboundConversations = brandConversations.filter((conversation) =>
    inWindow(conversation.createdAt),
  ).length;

  let messagesIn = 0;
  let messagesOut = 0;
  let aiReplies = 0;
  let ruleReplies = 0;
  for (const message of state.messages) {
    if (!conversationIds.has(message.conversationId) || !inWindow(message.createdAt)) continue;
    if (message.direction === "inbound") {
      messagesIn += 1;
    } else if (message.direction === "outbound") {
      messagesOut += 1;
      if (message.metadata?.aiProvider) aiReplies += 1;
      else ruleReplies += 1;
    }
  }

  const runs = flowRuns.filter((run) => run.brand === brand && inWindow(run.startedAt));
  const starts = runs.length;
  const completions = runs.filter(
    (run) => run.status === "completed" && inWindow(run.completedAt),
  ).length;

  const brandHandoffs = Object.values(state.handoffs).filter((handoff) => handoff.brand === brand);
  const handoffsCreated = brandHandoffs.filter((handoff) => inWindow(handoff.createdAt)).length;
  const openHandoffs = brandHandoffs.filter((handoff) => handoff.status !== "resolved").length;

  const ledger = state.analytics.filter(
    (event) => event.brand === brand && inWindow(event.createdAt),
  );
  const optOuts = ledger.filter((event) => event.name === "opt_out").length;
  const leadsCaptured = ledger.filter((event) => event.name === "lead_captured").length;

  const failedJobs = Object.values(state.jobs).filter(
    (job) => job.brand === brand && job.status === "failed" && inWindow(job.createdAt),
  );
  const byClass: Record<SendErrorClass, number> = {
    template_rejected: 0,
    window_closed: 0,
    rate_limited: 0,
    auth: 0,
    permanent: 0,
    transient: 0,
  };
  for (const job of failedJobs) {
    byClass[classifySendError(job.lastError ?? "")] += 1;
  }

  const costUsd = estimateAiCostUsd(ai.tokens);

  return {
    brand,
    window,
    generatedAt: new Date().toISOString(),
    conversations: { inbound: inboundConversations },
    messages: { inbound: messagesIn, outbound: messagesOut, aiReplies, ruleReplies },
    flows: {
      starts,
      completions,
      completionRate: starts > 0 ? completions / starts : null,
    },
    handoffs: { created: handoffsCreated, open: openHandoffs },
    optOuts,
    leads: { captured: leadsCaptured },
    ai: { tokens: ai.tokens, calls: ai.calls, costUsd, daysWithData: ai.daysWithData },
    deliveryFailures: { total: failedJobs.length, byClass },
    costPerConversationUsd:
      inboundConversations > 0 ? Number((costUsd / inboundConversations).toFixed(6)) : null,
    costPerLeadUsd: leadsCaptured > 0 ? Number((costUsd / leadsCaptured).toFixed(6)) : null,
  };
}

// ─── RETENTION POLICY (Wave 6) ───
// Analytics itself stores NOTHING in the state blob — every metric is
// computed at request time from sources that already expire:
//   - webhook event ledger: 48h TTL per event, 500-index cap (lib/events.ts)
//   - flow-run records: 7d TTL, 500-index cap (lib/flowruns.ts)
//   - ops event log: 7d TTL, 500-event cap (lib/ops.ts)
//   - AI daily usage: expires at UTC midnight (lib/ai-budget.ts)
//   - state messages/analytics/jobs: retentionDays-bounded pruning
//     (default 90d, min 7d) + array caps (lib/store.ts pruneState)
// The only Wave 6 write — the per-brand daily AI history snapshot
// (yochat:ai:history:<brand>:<yyyy-mm-dd>) — carries a 30-day TTL and is
// one small JSON key per brand per day (≤ 90 keys total across 3 brands);
// the memory fallback prunes keys older than 40 days on every write.
// Consequence: 24h metrics are exact; 7d/30d metrics reflect only the
// retained sources (flow runs cover the last 7d; AI history covers days
// since the operator first viewed analytics; state arrays cover the
// retention window). Counts are documented as "retained-source" numbers,
// not a warehouse.
