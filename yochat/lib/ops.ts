import { redisCommand, redisConfigured } from "@/lib/redis";

/**
 * Operational observability (Wave 1).
 *
 * - Worker heartbeats: background processors (ingest, job runner) stamp a
 *   key with a short TTL. The health surface reports staleness, so a dead
 *   scheduler is visible instead of silent.
 * - Ops event log: leveled (info/warning/error) operational events with a
 *   7-day TTL, feeding the diagnostics view. Replaces bare console.error
 *   calls in hot paths.
 *
 * Redis layout:
 *   yochat:heartbeat:<worker> -> ISO timestamp, 120s TTL
 *   yochat:ops                   -> list of JSON events (newest first, cap 500), 7d TTL
 */

export type OpsLevel = "info" | "warning" | "error";

export type OpsEvent = {
  id: string;
  level: OpsLevel;
  area: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

const HEARTBEAT_PREFIX = "yochat:heartbeat:";
const HEARTBEAT_TTL_SECONDS = 120;
const HEARTBEAT_STALE_AFTER_SECONDS = 180;
const OPS_KEY = "yochat:ops";
const OPS_CAP = 500;
const OPS_TTL_SECONDS = 7 * 24 * 60 * 60;

type MemoryGlobal = typeof globalThis & {
  __yochatHeartbeats?: Map<string, string>;
  __yochatOps?: OpsEvent[];
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}

function memoryHeartbeats(): Map<string, string> {
  const global = memoryGlobal();
  global.__yochatHeartbeats ??= new Map();
  return global.__yochatHeartbeats;
}

function memoryOps(): OpsEvent[] {
  const global = memoryGlobal();
  global.__yochatOps ??= [];
  return global.__yochatOps;
}

let opsCounter = 0;

export async function heartbeat(worker: string): Promise<void> {
  const stamp = new Date().toISOString();
  if (!redisConfigured()) {
    memoryHeartbeats().set(worker, stamp);
    return;
  }
  // War-room (g): degrade to memory on Redis failure instead of throwing.
  try {
    await redisCommand(["SET", HEARTBEAT_PREFIX + worker, stamp, "EX", HEARTBEAT_TTL_SECONDS]);
  } catch {
    memoryHeartbeats().set(worker, stamp);
  }
}

export async function getHeartbeats(): Promise<
  Record<string, { at?: string; ageSeconds?: number; stale: boolean }>
> {
  const workers = ["ingest", "jobs", "scheduler"];
  const result: Record<string, { at?: string; ageSeconds?: number; stale: boolean }> = {};
  const now = Date.now();

  for (const worker of workers) {
    let stamp: string | undefined;
    if (redisConfigured()) {
      // War-room (g): degrade to memory on Redis failure (first failure
      // opens the circuit) instead of 500ing the caller.
      try {
        stamp = (await redisCommand<string | null>(["GET", HEARTBEAT_PREFIX + worker])) ?? undefined;
      } catch {
        stamp = memoryHeartbeats().get(worker);
      }
    } else {
      stamp = memoryHeartbeats().get(worker);
    }
    if (!stamp) {
      result[worker] = { stale: true };
      continue;
    }
    const ageSeconds = Math.max(0, Math.round((now - new Date(stamp).getTime()) / 1000));
    result[worker] = { at: stamp, ageSeconds, stale: ageSeconds > HEARTBEAT_STALE_AFTER_SECONDS };
  }
  return result;
}

export async function logOps(
  level: OpsLevel,
  area: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const event: OpsEvent = {
    id: `ops-${Date.now()}-${(opsCounter += 1)}`,
    level,
    area,
    message: message.slice(0, 500),
    metadata,
    createdAt: new Date().toISOString(),
  };

  if (!redisConfigured()) {
    const ops = memoryOps();
    ops.unshift(event);
    while (ops.length > OPS_CAP) ops.pop();
    return;
  }

  // War-room (g): degrade to memory on Redis failure instead of throwing
  // (which would 500 the calling request).
  try {
    await redisCommand(["LPUSH", OPS_KEY, JSON.stringify(event)]);
    await redisCommand(["LTRIM", OPS_KEY, 0, OPS_CAP - 1]);
    await redisCommand(["EXPIRE", OPS_KEY, OPS_TTL_SECONDS]);
  } catch {
    const ops = memoryOps();
    ops.unshift(event);
    while (ops.length > OPS_CAP) ops.pop();
  }

  // Errors also go to the function log so Vercel captures them.
  if (level === "error") console.error(`[yochat:${area}] ${message}`, metadata ?? "");
}

export async function getRecentOps(limit = 50, level?: OpsLevel): Promise<OpsEvent[]> {
  const capped = Math.min(200, Math.max(1, limit));

  let events: OpsEvent[];
  if (!redisConfigured()) {
    events = [...memoryOps()];
  } else {
    // War-room (g): degrade to memory on Redis failure instead of throwing.
    try {
      const raw = await redisCommand<string[]>(["LRANGE", OPS_KEY, 0, capped - 1]);
      events = raw
        .map((item) => {
          try {
            return JSON.parse(item) as OpsEvent;
          } catch {
            return undefined;
          }
        })
        .filter((event): event is OpsEvent => Boolean(event));
    } catch {
      events = [...memoryOps()];
    }
  }

  return level ? events.filter((event) => event.level === level).slice(0, capped) : events.slice(0, capped);
}
