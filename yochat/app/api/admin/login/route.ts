import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  createAdminToken,
  loginRateLimit,
  recordLoginResult,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { loadState } from "@/lib/store";

export async function POST(request: Request) {
  const rateLimit = await loginRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  // Wave 9 (item 6): the password is verified against the CURRENT hash — the
  // runtime override in state.security when set, otherwise ADMIN_PASSWORD.
  const stateHash = (await loadState()).security.adminPasswordHash;
  if (!body.password || !verifyAdminPassword(body.password, stateHash)) {
    await recordLoginResult(request, false);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  await recordLoginResult(request, true);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminToken(body.password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
