import { after, NextResponse } from "next/server";
import { recordWebhookEvent } from "@/lib/events";
import {
  extractIncomingEvents,
  type MetaWebhookPayload,
  processMetaWebhook,
  secureEqual,
  verifyMetaSignature,
} from "@/lib/meta";
import { logOps } from "@/lib/ops";
import { publishToQStash, qstashConfigured } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = process.env.META_VERIFY_TOKEN;

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    expectedToken &&
    secureEqual(token, expectedToken)
  ) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Webhook War (WH-02): JSON bodies like `null`, `"str"`, or `[]` parse fine
  // but are not webhook payloads — reject before touching payload.object.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appSecret = payload.object === "instagram" ? process.env.META_INSTAGRAM_APP_SECRET : process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Server is missing Meta app secrets" }, { status: 500 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (payload.object !== "page" && payload.object !== "instagram") {
    return NextResponse.json({ error: "Unsupported webhook object" }, { status: 404 });
  }

  const events = extractIncomingEvents(payload);

  // Durable ingestion (Wave 1): when QStash is configured, every verified
  // event is recorded in the ledger and enqueued for the ingest worker, and
  // we acknowledge immediately. Without QStash (local/dev/test) the legacy
  // inline path is preserved unchanged.
  if (qstashConfigured()) {
    try {
      const origin = new URL(request.url).origin;
      for (const event of events) {
        await recordWebhookEvent(event);
        await publishToQStash(`${origin}/api/ingest/process`, { eventId: event.id });
      }
      await logOps("info", "ingest", `Enqueued ${events.length} webhook event(s) via QStash`);
      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (error) {
      await logOps("error", "ingest", "QStash enqueue failed; falling back to inline processing", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Fall through to inline processing rather than dropping a verified event.
    }
  }

  // Record synchronously so the ledger reflects receipt even if background
  // processing is delayed; processMetaWebhook updates status as it works.
  // Webhook War (WH-04): a ledger-record failure must fail the webhook with a
  // 500 so Meta retries the delivery. Returning 200 here would silently drop
  // a verified event (it would sit in limbo with no durable record).
  //
  // BUG-CHAOS-1 repair: the after() registration used to live ABOVE this
  // loop. When the ledger record failed -> 500, the already-registered
  // after() still executed -> the event was fully processed even though we
  // told Meta "not ingested" (duplicate-processing risk on Meta retry).
  // after() is now registered only AFTER the record loop succeeds, so an
  // HTTP 500 strictly means "not ingested" and the Meta retry becomes the
  // single processing. The QStash branch above is unaffected (it returns
  // before this point on success, and falls through to this path on failure).
  for (const event of events) {
    try {
      await recordWebhookEvent(event);
    } catch (error) {
      try {
        await logOps("warning", "ingest", "Failed to record webhook event", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } catch {
        // Logging is best-effort; it must never mask the record failure.
      }
      return NextResponse.json({ error: "Failed to record webhook event" }, { status: 500 });
    }
  }

  after(async () => {
    try {
      await processMetaWebhook(payload);
    } catch (error) {
      await logOps("error", "ingest", "Meta webhook processing failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
}
