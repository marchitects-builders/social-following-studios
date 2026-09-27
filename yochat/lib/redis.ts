
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
  if (!url || !token) return false;
  // War-room (g): credentials alone don't mean Redis is reachable. When the
  // circuit is open the caller degrades to its in-memory fallback instead of
  // throwing on every request.
  return !redisCircuitOpen();
}

/** Credentials exist for this scope, regardless of circuit state. */
export function redisCredentialsConfigured(scope: RedisScope = "ops"): boolean {
  const { url, token } = scope === "state" ? stateRedisCredentials() : opsRedisCredentials();
  return Boolean(url && token);
}

/**
 * War-room (g): runtime Redis circuit breaker (global across scopes).
 *
 * Before this, `redisConfigured()` only checked that credentials exist, so a
 * Redis outage made EVERY Redis-touching request throw (webhooks 500, cron
 * 500) instead of degrading to the in-memory fallbacks. The breaker opens
 * immediately on connection-level failures (fetch throws: refused/reset/
 * DNS/timeout) and after 3 consecutive HTTP 5xx failures. HTTP 4xx and Redis
 * command errors do NOT trip it — Redis is reachable in those cases, so the
 * failure is an app bug that must stay loud. After
 * `YOCHAT_REDIS_CIRCUIT_COOLDOWN_MS` (default 30s) the breaker half-opens:
 * the next command probes Redis, success closes the circuit, failure
 * re-opens it.
 *
 * The circuit is global (not per credential scope): the state and ops
 * scopes normally share the same Upstash estate, and a global breaker keeps
 * `storageMode()`/health consistent with the command path. The safe failure
 * direction is to degrade more, not less.
 *
 * Single-process scope: each server/worker instance tracks its own circuit.
 * In serverless/multi-instance deployments one instance's degraded mode does
 * not imply another's.
 */
type RedisCircuit = { failures: number; openedAt: number | null };
let circuit: RedisCircuit = { failures: 0, openedAt: null };

const CIRCUIT_MAX_FAILURES = 3;

function circuitCooldownMs(): number {
  const raw = Number(process.env.YOCHAT_REDIS_CIRCUIT_COOLDOWN_MS ?? 30000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30000;
}

function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch() network failure
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|UND_ERR/i.test(message);
}

/** True while the circuit is open (Redis treated as unavailable). */
export function redisCircuitOpen(): boolean {
  if (circuit.openedAt === null) return false;
  if (Date.now() - circuit.openedAt >= circuitCooldownMs()) return false; // half-open probe
  return true;
}

function recordRedisSuccess(): void {
  circuit = { failures: 0, openedAt: null };
}

function recordRedisFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const httpStatus = /Redis REST returned HTTP (\d+)/.exec(message)?.[1];
  if (httpStatus && Number(httpStatus) < 500) return; // 4xx: Redis reachable, app bug — stay loud
  if (/payload error|ERR /i.test(message) && !httpStatus) return; // Redis command error — stay loud
  circuit.failures += 1;
  if (isConnectionError(error) || circuit.failures >= CIRCUIT_MAX_FAILURES) {
    // Always refresh openedAt so a failed half-open probe re-opens the
    // circuit for a full cooldown instead of staying half-open.
    circuit.openedAt = Date.now();
  }
}

async function redisCommandWith(
  credentials: { url?: string; token?: string },
  command: Array<string | number>,
): Promise<unknown> {
  const { url, token } = credentials;
  if (!url || !token) throw new Error("Redis is not configured");
  if (redisCircuitOpen()) throw new Error("Redis circuit is open (degraded to memory)");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Redis REST returned HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: unknown; error?: string };
    if (payload.error) throw new Error(payload.error);
    recordRedisSuccess();
    return payload.result;
  } catch (error) {
    recordRedisFailure(error);
    throw error;
  }
}

export async function redisCommand<T>(command: Array<string | number>, scope: RedisScope = "ops"): Promise<T> {
  const credentials = scope === "state" ? stateRedisCredentials() : opsRedisCredentials();
  return (await redisCommandWith(credentials, command)) as T;
}

/**
 * HGETALL with raw-REST fidelity. Upstash REST returns a flat alternating
 * array [field, value, ...], NOT an object — normalize to a record so callers
 * never misread fields (War-room (g): getWebhookEvent previously saw
 * `fields.eventId` as undefined on real Redis and treated every ledgered
 * event as unknown).
 */
export async function redisHashGetAll(key: string, scope: RedisScope = "ops"): Promise<Record<string, string>> {
  const raw = await redisCommand<Record<string, string> | string[]>(["HGETALL", key], scope);
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return raw ?? {};
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
