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

  after(async () => {
    try {
      await processMetaWebhook(payload);
    } catch (error) {
      await logOps("error", "ingest", "Meta webhook processing failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Record synchronously so the ledger reflects receipt even if background
  // processing is delayed; processMetaWebhook updates status as it works.
  for (const event of events) {
    try {
      await recordWebhookEvent(event);
    } catch (error) {
      await logOps("warning", "ingest", "Failed to record webhook event", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
