import { addAudit, loadState, mutateState } from "@/lib/store";
import { redisCommand, redisConfigured } from "@/lib/redis";
import { AI_MAX_TOKENS, estimateTokens } from "@/lib/ai-provider";
import type { BrandKey } from "@/lib/types";

/**
 * Wave 5 — AI cost controls (ACTIVE enforcement, not passive tracking).
 *
 * (a) Hard 500-char inbound truncation before prompt construction —
 *     malicious users paste whole articles to drain the context window.
 * (b) Per-brand daily token budget with an ATOMIC pre-flight spend check
 *     (Redis Lua check-and-reserve; in-memory fallback with the same
 *     semantics when Redis is not configured).
 * (c) On exhaustion: a HARDCODED degradation response + the conversation
 *     is routed to the human-handoff queue (NOT a silent fail, NOT a 500).
 *     The brand stays degraded until the UTC date rolls over.
 * (d) Strict max_tokens clamp at the API call site (see lib/ai-provider.ts).
 * (e) Per-brand daily token/cost accounting surfaced in /api/admin/ops.
 */

export const INBOUND_CHAR_LIMIT = 500;
export const DEFAULT_DAILY_TOKEN_BUDGET = 20_000;
/** Rough hosted-Llama estimate; reported as an estimate, not a bill. */
export const ESTIMATED_COST_PER_1K_TOKENS_USD = 0.0009;

export const AI_DEGRADATION_REPLY =
  "We are experiencing unusually high message volume. A human team member will review your message shortly.";

export function truncateInbound(text: string): string {
  return text.length > INBOUND_CHAR_LIMIT ? text.slice(0, INBOUND_CHAR_LIMIT) : text;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(60, Math.round((midnight.getTime() - now.getTime()) / 1000));
}

function spendKey(brand: BrandKey): string {
  return `yochat:ai:spend:${brand}:${todayKey()}`;
}

function usageKey(brand: BrandKey): string {
  return `yochat:ai:usage:${brand}:${todayKey()}`;
}

type MemoryGlobal = typeof globalThis & {
  __yochatAiSpend?: Map<string, number>;
  __yochatAiUsage?: Map<string, { inputTokens: number; outputTokens: number; calls: number }>;
};

function memorySpend(): Map<string, number> {
  const global = globalThis as MemoryGlobal;
  global.__yochatAiSpend ??= new Map();
  return global.__yochatAiSpend;
}

function memoryUsage(): Map<string, { inputTokens: number; outputTokens: number; calls: number }> {
  const global = globalThis as MemoryGlobal;
  global.__yochatAiUsage ??= new Map();
  return global.__yochatAiUsage;
}

export async function getDailyTokenBudget(brand: BrandKey): Promise<number> {
  const state = await loadState();
  return state.ai.dailyTokenBudgets[brand] ?? DEFAULT_DAILY_TOKEN_BUDGET;
}

export async function setDailyTokenBudget(brand: BrandKey, tokens: number, actor = "admin"): Promise<number> {
  if (!Number.isInteger(tokens) || tokens < 0) throw new Error("tokens must be a non-negative integer");
  await mutateState((state) => {
    state.ai.dailyTokenBudgets[brand] = tokens;
    addAudit(state, { action: "ai.budget.set", actor, target: brand, detail: { tokens } });
  });
  return tokens;
}

export type SpendReservation = {
  allowed: boolean;
  used: number;
  budget: number;
  exhausted: boolean;
};

/**
 * Atomic pre-flight spend check. Redis: one Lua script does
 * check-and-reserve so concurrent webhooks cannot both pass. Memory
 * fallback: the dev server is single-process; the Map write is the
 * same critical section.
 */
export async function reserveAiTokens(brand: BrandKey, estimatedTokens: number): Promise<SpendReservation> {
  const budget = await getDailyTokenBudget(brand);
  const est = Math.max(1, Math.ceil(estimatedTokens));
  const key = spendKey(brand);

  if (redisConfigured()) {
    const script = `
      local used = tonumber(redis.call("GET", KEYS[1]) or "0")
      if used + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
        return {0, used}
      end
      local next = redis.call("INCRBY", KEYS[1], ARGV[1])
      redis.call("EXPIRE", KEYS[1], ARGV[3])
      return {1, next}
    `;
    const result = await redisCommand<[number, number]>([
      "EVAL",
      script,
      1,
      key,
      est,
      budget,
      secondsUntilMidnightUtc(),
    ]);
    const used = result[1];
    return { allowed: result[0] === 1, used, budget, exhausted: used >= budget };
  }

  const spend = memorySpend();
  const used = spend.get(key) ?? 0;
  if (used + est > budget) return { allowed: false, used, budget, exhausted: used >= budget };
  spend.set(key, used + est);
  return { allowed: true, used: used + est, budget, exhausted: used + est >= budget };
}

export type AiUsage = { inputTokens: number; outputTokens: number; calls: number };

export async function recordAiUsage(brand: BrandKey, inputTokens: number, outputTokens: number): Promise<void> {
  const key = usageKey(brand);
  if (redisConfigured()) {
    const raw = (await redisCommand<string | null>(["GET", key])) ?? null;
    const current: AiUsage = raw ? (JSON.parse(raw) as AiUsage) : { inputTokens: 0, outputTokens: 0, calls: 0 };
    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.calls += 1;
    await redisCommand(["SET", key, JSON.stringify(current), "EX", secondsUntilMidnightUtc()]);
    return;
  }
  const usage = memoryUsage();
  const current = usage.get(key) ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
  current.inputTokens += inputTokens;
  current.outputTokens += outputTokens;
  current.calls += 1;
  usage.set(key, current);
}

export async function getAiUsage(brand: BrandKey): Promise<AiUsage> {
  const key = usageKey(brand);
  if (redisConfigured()) {
    const raw = (await redisCommand<string | null>(["GET", key])) ?? null;
    return raw ? (JSON.parse(raw) as AiUsage) : { inputTokens: 0, outputTokens: 0, calls: 0 };
  }
  return memoryUsage().get(key) ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
}

export async function getAiSpend(brand: BrandKey): Promise<number> {
  const key = spendKey(brand);
  if (redisConfigured()) {
    return Number((await redisCommand<string | null>(["GET", key])) ?? 0);
  }
  return memorySpend().get(key) ?? 0;
}

export type AiBrandDiagnostics = {
  brand: BrandKey;
  budget: number;
  usedTokens: number;
  remainingTokens: number;
  exhausted: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export async function getAiDiagnostics(): Promise<{
  date: string;
  maxTokensPerCall: number;
  inboundCharLimit: number;
  brands: AiBrandDiagnostics[];
}> {
  const brands: BrandKey[] = ["marchitects", "social-following", "aafc"];
  const rows = await Promise.all(
    brands.map(async (brand) => {
      const [budget, usedTokens, usage] = await Promise.all([
        getDailyTokenBudget(brand),
        getAiSpend(brand),
        getAiUsage(brand),
      ]);
      const totalTokens = usage.inputTokens + usage.outputTokens;
      return {
        brand,
        budget,
        usedTokens,
        remainingTokens: Math.max(0, budget - usedTokens),
        exhausted: usedTokens >= budget,
        calls: usage.calls,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: Number(((totalTokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD).toFixed(6)),
      };
    }),
  );
  return { date: todayKey(), maxTokensPerCall: AI_MAX_TOKENS, inboundCharLimit: INBOUND_CHAR_LIMIT, brands: rows };
}

/** Rough pre-flight estimate: truncated prompt chars + max output tokens. */
export function estimateCallTokens(system: string, user: string): number {
  return estimateTokens(system + user) + AI_MAX_TOKENS;
}
