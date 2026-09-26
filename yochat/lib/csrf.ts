import { createHmac, timingSafeEqual } from "node:crypto";
import { tokenFromRequest } from "@/lib/admin-auth";

/**
 * Wave 9 (item 5) — CSRF protection for admin mutations.
 *
 * Mechanism: stateless synchronizer token bound to the admin session.
 * The token is HMAC(ADMIN_SESSION_SECRET, sessionCookie + ":csrf") — it can
 * only be minted by someone who holds the httpOnly session cookie, and it
 * is verified without any server-side storage. Admin POST/PUT/DELETE routes
 * (except /api/admin/login, which issues the session) require it in the
 * `x-csrf-token` header via requireCsrf().
 *
 * Clients (dashboard UI, smoke suite) fetch it once from GET /api/admin/csrf
 * and attach it to every mutating request.
 */

const CSRF_HEADER = "x-csrf-token";

function csrfSecret(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createCsrfToken(sessionCookie: string): string {
  const secret = csrfSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD is required");
  return createHmac("sha256", secret).update(`${sessionCookie}:csrf`).digest("base64url");
}

export function expectedCsrfToken(request: Request): string | undefined {
  const sessionCookie = tokenFromRequest(request);
  if (!sessionCookie) return undefined;
  try {
    return createCsrfToken(sessionCookie);
  } catch {
    return undefined;
  }
}

/** True when the request carries the synchronizer token matching its admin session. */
export function verifyCsrfToken(request: Request): boolean {
  const presented = request.headers.get(CSRF_HEADER);
  const expected = expectedCsrfToken(request);
  return Boolean(presented && expected && safeEqual(presented, expected));
}

export function csrfHeaderName(): string {
  return CSRF_HEADER;
}
