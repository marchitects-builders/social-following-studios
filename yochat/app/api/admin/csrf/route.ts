import { NextResponse } from "next/server";
import { isAdminRequest, tokenFromRequest } from "@/lib/admin-auth";
import { createCsrfToken } from "@/lib/csrf";

/**
 * Wave 9 (item 5): mints the CSRF synchronizer token for the current admin
 * session. The token is bound to the session cookie (HMAC), so it is only
 * obtainable by someone who already holds a valid admin session.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionCookie = tokenFromRequest(request);
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ csrfToken: createCsrfToken(sessionCookie) });
}
