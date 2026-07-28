import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getDefaultBrand } from "@/lib/brands";
import { processIncomingEvent } from "@/lib/engine";
import type { BrandKey, TriggerType } from "@/lib/types";

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);
const allowedTriggers = new Set<TriggerType>(["message", "comment", "story_reply", "mention", "postback", "referral", "follow", "test"]);

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    brand?: BrandKey;
    trigger?: TriggerType;
    text?: string;
    persona?: string;
  };
  if (!body.brand || !allowedBrands.has(body.brand) || !body.text?.trim()) {
    return NextResponse.json({ error: "Brand and message are required" }, { status: 400 });
  }
  const trigger = body.trigger && allowedTriggers.has(body.trigger) ? body.trigger : "test";
  const brand = getDefaultBrand(body.brand);
  const persona = (body.persona || "rashida-test-account").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const result = await processIncomingEvent({
    id: `test:${randomUUID()}`,
    channel: "test",
    accountId: brand.instagramId,
    senderId: persona,
    username: persona,
    trigger,
    text: body.text.trim(),
    timestamp: new Date().toISOString(),
    commentId: trigger === "comment" ? `test-comment:${randomUUID()}` : undefined,
    referral: trigger === "referral" ? "test-referral" : undefined,
    metadata: { simulated: true },
  });
  return NextResponse.json({
    brand: result.brand.key,
    intent: result.intent,
    reply: result.reply,
    ignored: result.ignored,
    contact: result.contact,
    conversation: result.conversation,
    handoff: result.handoff,
  });
}
