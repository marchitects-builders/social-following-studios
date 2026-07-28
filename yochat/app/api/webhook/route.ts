import { after, NextResponse } from "next/server";
import {
  type MetaWebhookPayload,
  processMetaWebhook,
  secureEqual,
  verifyMetaSignature,
} from "@/lib/meta";

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

  after(async () => {
    try {
      await processMetaWebhook(payload);
    } catch (error) {
      console.error("Meta webhook processing failed", error instanceof Error ? error.message : "Unknown error");
    }
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
}
