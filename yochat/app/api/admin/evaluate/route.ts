import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getDefaultBrand } from "@/lib/brands";
import { processIncomingEvent } from "@/lib/engine";
import type { BrandKey, EngineResult, Intent, TriggerType } from "@/lib/types";

type Evaluation = { name: string; brand: BrandKey; passed: boolean; detail: string };

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const suite = randomUUID().slice(0, 8);

  async function run(
    name: string,
    brandKey: BrandKey,
    text: string,
    expectedIntent: Intent,
    options: { trigger?: TriggerType; persona?: string; expectHandoff?: boolean; expectEmail?: boolean } = {},
  ): Promise<Evaluation> {
    const brand = getDefaultBrand(brandKey);
    const result = await processIncomingEvent({
      id: `evaluation:${suite}:${randomUUID()}`,
      channel: "test",
      accountId: brand.instagramId,
      senderId: options.persona ?? `evaluation-${suite}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      username: "yochat-evaluation",
      trigger: options.trigger ?? "test",
      text,
      timestamp: new Date().toISOString(),
      commentId: options.trigger === "comment" ? `evaluation-comment:${randomUUID()}` : undefined,
      metadata: { evaluation: true },
    });
    const passed =
      result.intent === expectedIntent &&
      Boolean(result.reply) &&
      (!options.expectHandoff || Boolean(result.handoff)) &&
      (!options.expectEmail || result.contact.email === "rashida.test@example.com");
    return {
      name,
      brand: brandKey,
      passed,
      detail: passed
        ? `${result.intent} detected and safe reply generated`
        : `Expected ${expectedIntent}; received ${result.intent}${result.ignored ? ` (${result.ignored})` : ""}`,
    };
  }

  const evaluations: Evaluation[] = [];
  evaluations.push(await run("Booking", "marchitects", "I want to book a consultation", "booking"));
  evaluations.push(await run("Pricing", "marchitects", "How much does an automation package cost?", "pricing"));
  evaluations.push(await run("Comment keyword", "social-following", "GROW", "services", { trigger: "comment" }));
  evaluations.push(await run("Lead magnet", "social-following", "Please send the guide", "lead_capture"));
  evaluations.push(await run("Volunteer", "aafc", "I want to volunteer", "volunteer"));
  evaluations.push(await run("Partnership", "aafc", "Our organization wants to partner", "partnership"));
  evaluations.push(await run("Lead capture", "marchitects", "My email is rashida.test@example.com", "lead_capture", { expectEmail: true }));
  evaluations.push(await run("Human handoff", "aafc", "I need to speak with a human", "human", { expectHandoff: true }));

  const consentPersona = `evaluation-${suite}-consent`;
  evaluations.push(await run("Opt out", "social-following", "STOP", "opt_out", { persona: consentPersona }));
  evaluations.push(await run("Opt back in", "social-following", "START", "opt_in", { persona: consentPersona }));

  const brand = getDefaultBrand("marchitects");
  const duplicateId = `evaluation:${suite}:duplicate`;
  const duplicateEvent = {
    id: duplicateId,
    channel: "test" as const,
    accountId: brand.instagramId,
    senderId: `evaluation-${suite}-duplicate`,
    trigger: "test" as const,
    text: "Hello",
    timestamp: new Date().toISOString(),
  };
  await processIncomingEvent(duplicateEvent);
  const duplicate: EngineResult = await processIncomingEvent(duplicateEvent);
  evaluations.push({
    name: "Duplicate protection",
    brand: "marchitects",
    passed: duplicate.ignored === "duplicate_event",
    detail: duplicate.ignored === "duplicate_event" ? "Duplicate safely ignored" : "Duplicate was not ignored",
  });

  const passed = evaluations.filter((item) => item.passed).length;
  return NextResponse.json({
    suite,
    passed,
    total: evaluations.length,
    healthy: passed === evaluations.length,
    evaluations,
    note: "All checks used test-channel identities and sent no external messages.",
  });
}
