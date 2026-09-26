import { NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdminRequest } from "@/lib/admin-auth";
import { verifyCsrfToken } from "@/lib/csrf";

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Wave 9 (item 5): CSRF synchronizer token required on admin mutations.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { expires: new Date(0), path: "/" });
  return response;
}
