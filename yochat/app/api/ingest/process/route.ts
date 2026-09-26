import { NextResponse } from "next/server";
import { processIncomingEvent } from "@/lib/engine";
import { getWebhookEvent, updateWebhookEvent } from "@/lib/events";
import { deliverMetaJob } from "@/lib/meta";
import { processDueJobs } from "@/lib/jobs";
import { heartbeat, logOps } from "@/lib/ops";
import { qstashSignatureConfigured, qstashSignatureGate } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Durable webhook ingest worker (Wave 1).
 *
 * The webhook route publishes one QStash message per verified event; this
 * route processes exactly one event per invocation. Auth is the same
 * CRON_SECRET bearer pattern as the other server-to-server routes, forwarded
 * by QStash via Upstash-Forward-Authorization.
 *
 * Idempotency: events already "processed" are acknowledged without rework;
 * events stuck in "processing" (a crashed prior attempt) are retried — the
 * engine's own per-event dedupe keeps effects at-most-once.
 */
export async function POST(request: Request) {
  // Wave 9 (item 2): QStash signature verification. When signing keys are
  // configured, a valid Upstash-Signature is REQUIRED — unsigned or forged
  // requests are rejected before any other check. Without keys, the legacy
  // bearer-only behavior is preserved (local/dev/test).
  const signatureGate = await qstashSignatureGate(request);
  if (!signatureGate.ok) {
    await logOps("warning", "ingest", "Rejected ingest request: bad QStash signature", {
      reason: signatureGate.reason,
    });
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Ingest is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let eventId: string | undefined;
  try {
    eventId = ((await request.json()) as { eventId?: string }).eventId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  const record = await getWebhookEvent(eventId);
  if (!record) {
    // Unknown or expired (48h TTL) — acknowledge so QStash doesn't poison-retry.
    return NextResponse.json({ ok: true, skipped: "unknown-event" });
  }
  if (record.status === "processed") {
    return NextResponse.json({ ok: true, skipped: "already-processed" });
  }

  await heartbeat("ingest");
  await updateWebhookEvent(eventId, { status: "processing" });

  try {
    const result = await processIncomingEvent(record.event);
    await updateWebhookEvent(eventId, {
      status: "processed",
      outcome: result.ignored ? "ignored" : result.intent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateWebhookEvent(eventId, { status: "failed", outcome: message.slice(0, 300) });
    await logOps("error", "ingest", "Ingest worker failed to process event", {
      eventId,
      error: message.slice(0, 300),
    });
    // 500 so QStash retries (Upstash-Retries: 3 on publish).
    return NextResponse.json({ ok: false, error: "Event processing failed" }, { status: 500 });
  }

  const delivery = await processDueJobs(deliverMetaJob);
  return NextResponse.json({ ok: true, delivery });
}
