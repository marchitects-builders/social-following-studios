import { redisConfigured, redisEval } from "@/lib/redis";

/**
 * Per-brand send rate limiting (Wave 1).
 *
 * Meta caps Instagram private replies (~750/hour/account). Without a limiter,
 * a campaign blast or a webhook burst can burn through the cap, hit 429s, and
 * waste retry attempts. Slots are reserved BEFORE sending and released on
 * failure so failed sends don't starve the bucket (OpenReply pattern,
 * reimplemented for Upstash Redis + in-memory fallback).
 *
 * Redis layout: yochat:ratelimit:<brand>:<channel> -> counter, 1h TTL window.
 */

const WINDOW_SECONDS = 3600;
const DEFAULT_LIMIT = 700; // under Meta's ~750/hr/IG-account cap, headroom for manual sends

// Atomic: increment, set expiry on first hit, deny when over limit.
const RESERVE_SCRIPT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if c > tonumber(ARGV[2]) then return 0 end
return 1`;

// Atomic: decrement, clamped at zero so a rolled-over window never goes negative.
const RELEASE_SCRIPT = `local c = redis.call('DECR', KEYS[1])
if c < 0 then redis.call('SET', KEYS[1], 0) end
return 1`;

type Bucket = { count: number; windowStart: number };

type MemoryGlobal = typeof globalThis & {
  __yochatRateBuckets?: Map<string, Bucket>;
};

function memoryBuckets(): Map<string, Bucket> {
  const global = globalThis as MemoryGlobal;
  global.__yochatRateBuckets ??= new Map();
  return global.__yochatRateBuckets;
}

function keyFor(brand: string, channel: string): string {
  return `yochat:ratelimit:${brand}:${channel}`;
}

export function rateLimitFor(brand: string, channel: string): { limit: number; windowSeconds: number } {
  // Per-brand overrides can be added via brand config later; single default for now.
  void brand;
  void channel;
  return { limit: DEFAULT_LIMIT, windowSeconds: WINDOW_SECONDS };
}

/** Reserve one send slot. Returns false when the brand/channel is over its limit. */
export async function reserveSendSlot(brand: string, channel: string): Promise<boolean> {
  const { limit, windowSeconds } = rateLimitFor(brand, channel);
  const key = keyFor(brand, channel);

  if (!redisConfigured()) {
    const buckets = memoryBuckets();
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowSeconds * 1000) {
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  const allowed = await redisEval<number>(RESERVE_SCRIPT, [key], [windowSeconds, limit]);
  return allowed === 1;
}

/** Release a previously reserved slot (call on send failure). */
export async function releaseSendSlot(brand: string, channel: string): Promise<void> {
  const key = keyFor(brand, channel);

  if (!redisConfigured()) {
    const bucket = memoryBuckets().get(key);
    if (bucket && bucket.count > 0) bucket.count -= 1;
    return;
  }

  await redisEval<number>(RELEASE_SCRIPT, [key], []);
}

/** Current usage snapshot for the health surface. */
export async function getRateLimitUsage(
  brand: string,
  channel: string,
): Promise<{ count: number; limit: number; windowSeconds: number }> {
  const { limit, windowSeconds } = rateLimitFor(brand, channel);
  const key = keyFor(brand, channel);

  if (!redisConfigured()) {
    const bucket = memoryBuckets().get(key);
    const now = Date.now();
    const count = bucket && now - bucket.windowStart < windowSeconds * 1000 ? bucket.count : 0;
    return { count, limit, windowSeconds };
  }

  const { redisCommand } = await import("@/lib/redis");
  const raw = await redisCommand<string | null>(["GET", key]);
  return { count: Number(raw ?? 0), limit, windowSeconds };
}
