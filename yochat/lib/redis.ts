
/**
 * Shared Upstash Redis REST helpers for YoChat's operational modules
 * (event ledger, rate limiting, heartbeats, ops log).
 *
 * The main state blob in lib/store.ts keeps its own REST client; this module
 * is for the smaller keyed structures introduced in Wave 1. When Redis is not
 * configured, callers fall back to in-memory implementations.
 */

/**
 * Wave 9 (item 8): separate Redis credentials for state vs operational data.
 *
 * - State scope (state blob + Wave 9 keyed contacts/transcripts):
 *   UPSTASH_REDIS_STATE_URL / UPSTASH_REDIS_STATE_TOKEN, falling back to the
 *   shared pair below.
 * - Ops scope (event ledger, rate limits, heartbeats, ops log, AI spend):
 *   UPSTASH_REDIS_OPS_URL / UPSTASH_REDIS_OPS_TOKEN, falling back to the
 *   state pair, then the shared pair below.
 *
 * When only the shared pair (or nothing) is configured, behavior is exactly
 * as before: ops falls back to a single credential set; when nothing is
 * configured, everything uses the in-memory fallbacks.
 */
export type RedisScope = "state" | "ops";

function sharedCredentials(): { url?: string; token?: string } {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  };
}

export function stateRedisCredentials(): { url?: string; token?: string } {
  const shared = sharedCredentials();
  return {
    url: process.env.UPSTASH_REDIS_STATE_URL ?? shared.url,
    token: process.env.UPSTASH_REDIS_STATE_TOKEN ?? shared.token,
  };
}

export function opsRedisCredentials(): { url?: string; token?: string } {
  const state = stateRedisCredentials();
  return {
    url: process.env.UPSTASH_REDIS_OPS_URL ?? state.url,
    token: process.env.UPSTASH_REDIS_OPS_TOKEN ?? state.token,
  };
}

/** Kept for backward compatibility: unscoped callers mean the ops scope. */
export function redisCredentials(): { url?: string; token?: string } {
  return opsRedisCredentials();
}

export function redisConfigured(scope: RedisScope = "ops"): boolean {
  const { url, token } = scope === "state" ? stateRedisCredentials() : opsRedisCredentials();
  return Boolean(url && token);
}

async function redisCommandWith(
  credentials: { url?: string; token?: string },
  command: Array<string | number>,
): Promise<unknown> {
  const { url, token } = credentials;
  if (!url || !token) throw new Error("Redis is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis REST returned HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

export async function redisCommand<T>(command: Array<string | number>, scope: RedisScope = "ops"): Promise<T> {
  const credentials = scope === "state" ? stateRedisCredentials() : opsRedisCredentials();
  return (await redisCommandWith(credentials, command)) as T;
}

/**
 * Run a Lua script via EVAL. Scripts must be kept trivial — they cannot be
 * integration-tested without a live Redis, so every script here is reviewed
 * for syntax by inspection and marked accordingly in the wave log.
 */
export async function redisEval<T>(
  script: string,
  keys: string[],
  args: Array<string | number>,
  scope: RedisScope = "ops",
): Promise<T> {
  return redisCommand<T>(["EVAL", script, keys.length, ...keys, ...args], scope);
}
