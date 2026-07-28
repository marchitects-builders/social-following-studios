import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  createAdminToken,
  loginRateLimit,
  recordLoginResult,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const rateLimit = await loginRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !verifyAdminPassword(body.password)) {
    await recordLoginResult(request, false);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  await recordLoginResult(request, true);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
