import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "yochat_admin";
const SESSION_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ATTEMPT_LIMIT = 5;

type LoginAttempt = { count: number; resetAt: number };
type AuthGlobal = typeof globalThis & { __yochatLoginAttempts?: Map<string, LoginAttempt> };

function secret(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected && password && safeEqual(password, expected));
}

export function createAdminToken(): string {
  const signingSecret = secret();
  if (!signingSecret) throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD is required");
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  const signingSecret = secret();
  if (!token || !signingSecret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", signingSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof decoded.exp === "number" && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function tokenFromRequest(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
}

export function isAdminRequest(request: Request): boolean {
  return verifyAdminToken(tokenFromRequest(request));
}

function clientKey(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", secret() ?? "yochat-login-limit").update(ip).digest("hex").slice(0, 24);
}

async function redisAuthCommand<T>(command: Array<string | number>): Promise<T | undefined> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return undefined;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { result?: T };
  return payload.result;
}

export async function loginRateLimit(request: Request): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = `yochat:login:${clientKey(request)}`;
  const redisCount = await redisAuthCommand<number | null>(["GET", key]);
  if (redisCount !== undefined) {
    const count = Number(redisCount ?? 0);
    const ttl = Number((await redisAuthCommand<number>(["TTL", key])) ?? LOGIN_WINDOW_SECONDS);
    return { allowed: count < LOGIN_ATTEMPT_LIMIT, retryAfter: Math.max(1, ttl) };
  }

  const global = globalThis as AuthGlobal;
  global.__yochatLoginAttempts ??= new Map();
  const current = global.__yochatLoginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    global.__yochatLoginAttempts.delete(key);
    return { allowed: true, retryAfter: LOGIN_WINDOW_SECONDS };
  }
  return { allowed: current.count < LOGIN_ATTEMPT_LIMIT, retryAfter: Math.max(1, Math.ceil((current.resetAt - Date.now()) / 1000)) };
}

export async function recordLoginResult(request: Request, success: boolean): Promise<void> {
  const key = `yochat:login:${clientKey(request)}`;
  if ((process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)) {
    if (success) await redisAuthCommand(["DEL", key]);
    else {
      const count = Number((await redisAuthCommand<number>(["INCR", key])) ?? 0);
      if (count === 1) await redisAuthCommand(["EXPIRE", key, LOGIN_WINDOW_SECONDS]);
    }
    return;
  }
  const global = globalThis as AuthGlobal;
  global.__yochatLoginAttempts ??= new Map();
  if (success) global.__yochatLoginAttempts.delete(key);
  else {
    const current = global.__yochatLoginAttempts.get(key);
    global.__yochatLoginAttempts.set(key, {
      count: (current?.resetAt && current.resetAt > Date.now() ? current.count : 0) + 1,
      resetAt: current?.resetAt && current.resetAt > Date.now() ? current.resetAt : Date.now() + LOGIN_WINDOW_SECONDS * 1000,
    });
  }
}
