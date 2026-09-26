import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getRecentWebhookEvents, summarizeWebhookEvent } from "@/lib/events";

/**
 * Admin diagnostics: recent webhook event ledger entries (Wave 1).
 * Payloads are summarized (text preview only) — full payloads stay server-side.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const events = await getRecentWebhookEvents(Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ events: events.map(summarizeWebhookEvent) });
}
