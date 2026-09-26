import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getDefaultBrands } from "@/lib/brands";
import { AI_MAX_TOKENS, getAiProvider, getLastStubCall, isTestMode } from "@/lib/ai-provider";
import { truncateInbound } from "@/lib/ai-budget";
import { getAiWriteLevel, validateAiIntent } from "@/lib/ai-intents";
import { runHallucinationEval, runRedTeamEval } from "@/lib/ai-eval";
import type { AiWriteLevel, BrandKey } from "@/lib/types";
import { verifyCsrfToken } from "@/lib/csrf";

/**
 * Wave 5 — AI evaluation harness (admin only).
 *
 * Actions:
 * - hallucination: Layer A (deterministic gate) + Layer B (LLM judge;
 *   stubbed in TEST_MODE / without an API key — never a paid call).
 *   Every case records which layers ran.
 * - redteam: adversarial fixtures — (a) responder non-compliance,
 *   (b) intent-allowlist rejection of injected writes.
 * - intent_check: probe the L0–L3 allowlist validator directly.
 * - provider_info: the provider seam (name, stubbed) — no model call.
 * - clamp_check: prove max_tokens clamps to AI_MAX_TOKENS.
 * - truncate_check: prove 500-char inbound truncation.
 * - stub_last_call: test-only introspection of the stub's last input.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Wave 9 (item 5): CSRF synchronizer token required on admin mutations.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    brand?: string;
    level?: number;
    intent?: unknown;
    text?: string;
    requested?: number;
  };
  const shortNames = Object.fromEntries(
    getDefaultBrands().map((brand) => [brand.key, brand.shortName]),
  ) as Record<BrandKey, string>;

  switch (body.action) {
    case "hallucination": {
      const result = await runHallucinationEval(shortNames);
      return NextResponse.json(result);
    }
    case "redteam": {
      const result = await runRedTeamEval(shortNames);
      return NextResponse.json(result);
    }
    case "intent_check": {
      const brand = (body.brand ?? "aafc") as BrandKey;
      const level = (typeof body.level === "number" ? body.level : await getAiWriteLevel(brand)) as AiWriteLevel;
      return NextResponse.json({ brand, level, validation: validateAiIntent(brand, level, body.intent) });
    }
    case "provider_info": {
      const { provider, metered } = getAiProvider();
      return NextResponse.json({
        name: provider.name,
        stubbed: provider.name.startsWith("stub"),
        metered,
        testMode: isTestMode(),
        maxTokensPerCall: AI_MAX_TOKENS,
      });
    }
    case "clamp_check": {
      const requested = typeof body.requested === "number" ? body.requested : 100000;
      const { provider } = getAiProvider();
      // Exercise the real clamp path through the stubbed provider.
      const result = await provider.complete({
        system: "clamp probe",
        user: "clamp probe",
        maxTokens: requested,
        knowledgeIds: [],
        brand: "aafc",
        brandShortName: "AAFC",
      });
      return NextResponse.json({ requested, effective: result.maxTokensUsed, clamped: result.maxTokensUsed === AI_MAX_TOKENS });
    }
    case "truncate_check": {
      const original = body.text ?? "";
      const truncated = truncateInbound(original);
      return NextResponse.json({
        originalLength: original.length,
        truncatedLength: truncated.length,
        withinLimit: truncated.length <= 500,
      });
    }
    case "stub_last_call": {
      if (!isTestMode()) return NextResponse.json({ error: "test mode only" }, { status: 400 });
      return NextResponse.json({ lastCall: getLastStubCall() ?? null });
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
