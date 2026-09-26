import OpenAI from "openai";
import type { BrandKey } from "@/lib/types";

/**
 * Wave 5 — minimal AI provider seam.
 *
 * The NVIDIA Llama 3.1 70B call site lives behind ONE interface
 * (provider name + call function). This is deliberately not a
 * multi-provider system — just enough seam that a second provider
 * could be added later without touching the engine.
 *
 * TEST_MODE (process.env.YOCHAT_TEST_MODE === "1") swaps in a
 * deterministic stubbed responder so the smoke suite never makes a
 * paid API call. When no NVIDIA_API_KEY is configured (and not in
 * test mode), the same stub runs unmetered as the legacy fallback.
 */

export const AI_MAX_TOKENS = 350;
export const AI_TEMPERATURE = 0.25;

export function isTestMode(): boolean {
  return process.env.YOCHAT_TEST_MODE === "1";
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export type AiCallInput = {
  system: string;
  user: string;
  /** requested ceiling; the provider clamps to AI_MAX_TOKENS */
  maxTokens: number;
  /** citation ids the prompt drew from, so the stub can ground honestly */
  knowledgeIds: string[];
  brand: BrandKey;
  brandShortName: string;
};

export type AiCallResult = {
  text: string;
  provider: string;
  stubbed: boolean;
  /** effective max_tokens after the clamp */
  maxTokensUsed: number;
  inputTokens: number;
  outputTokens: number;
};

export type AiProvider = {
  name: string;
  complete(input: AiCallInput): Promise<AiCallResult>;
};

function clampMaxTokens(requested: number): number {
  return Math.min(Math.max(1, Math.floor(requested)), AI_MAX_TOKENS);
}

function nvidiaProvider(): AiProvider {
  return {
    name: "nvidia-llama-3.1-70b",
    async complete(input: AiCallInput): Promise<AiCallResult> {
      const maxTokensUsed = clampMaxTokens(input.maxTokens);
      const client = new OpenAI({
        apiKey: process.env.NVIDIA_API_KEY,
        baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
        timeout: 12_000,
        maxRetries: 1,
      });
      const completion = await client.chat.completions.create({
        model: process.env.NVIDIA_MODEL_NAME ?? "meta/llama-3.1-70b-instruct",
        temperature: AI_TEMPERATURE,
        max_tokens: maxTokensUsed,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      const usage = completion.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      return {
        text,
        provider: "nvidia-llama-3.1-70b",
        stubbed: false,
        maxTokensUsed,
        inputTokens: usage?.prompt_tokens ?? estimateTokens(input.system + input.user),
        outputTokens: usage?.completion_tokens ?? estimateTokens(text),
      };
    },
  };
}

// ─── Deterministic test stub (TEST_MODE or no API key) ───

type MemoryGlobal = typeof globalThis & {
  __yochatStubLastCall?: { system: string; user: string; maxTokens: number; knowledgeIds: string[]; at: string };
};

function cite(ids: string[], slug: string, fallback: string): string {
  return ids.find((id) => id.includes(`:${slug}-v`)) ?? fallback;
}

const INJECTION_PATTERNS = [
  "ignore previous instructions",
  "ignore all instructions",
  "ignore your instructions",
  "disregard your instructions",
  "disregard all previous",
  "you are now",
  "reveal your system prompt",
  "reveal the system prompt",
  "show me your instructions",
  "write me a python",
  "write python",
  "write code for me",
  "write me code",
  "mark my invoice",
  "mark invoice paid",
  "change my email",
  "update my email",
  "change my phone",
  "do anything now",
  "dan mode",
  "jailbreak",
  "pretend you are",
];

/**
 * Deterministic canned replies. The stub is a test double, not a model:
 * every branch is a fixed mapping so red-team and hallucination fixtures
 * assert against stable, reviewable text.
 */
export function stubAiReply(text: string, brand: BrandKey, shortName: string, knowledgeIds: string[]): string {
  const normalized = text.toLowerCase();

  if (INJECTION_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return `I can't follow that instruction — I'm ${shortName}'s assistant and I only help with ${shortName} questions. What would you like help with today?`;
  }

  // Hallucination-eval fixture questions (exact, deterministic).
  if (brand === "aafc" && normalized.includes("how can i volunteer")) {
    return `You can volunteer with AAFC — tell me your city and what kind of work or events interest you, and I'll route you to the team. [${cite(knowledgeIds, "participation", "kb:aafc:participation-v1")}]`;
  }
  if (brand === "marchitects" && normalized.includes("what does marchitects do")) {
    return `Marchitects designs growth systems, websites, funnels, CRM and marketing automation, AI assistants, and business integrations. [${cite(knowledgeIds, "services", "kb:marchitects:services-v1")}]`;
  }
  if (brand === "social-following" && normalized.includes("what is a lead magnet")) {
    return `A lead magnet should solve one immediate problem and move the contact toward a relevant next step. [${cite(knowledgeIds, "lead-magnets", "kb:social-following:lead-magnets-v1")}]`;
  }
  if (normalized.includes("guaranteed results") || normalized.includes("guarantee")) {
    return `I can't promise guaranteed results. ${shortName === "AAFC" ? "AAFC connects artists, athletes, programs, partners, and communities to create practical opportunities and positive change." : `I can only share what's verified for ${shortName}.`} [${cite(knowledgeIds, "mission", `kb:${brand}:mission-v1`)}]`;
  }
  if (normalized.includes("enterprise package") || (normalized.includes("price") && normalized.includes("pricing") === false)) {
    return `I don't have verified pricing for that — I can connect you with the team. What's the best email for follow-up?`;
  }
  // Intent-fixture: an L1-eligible write proposal the validator must accept.
  if (brand === "aafc" && normalized.includes("interested in booking")) {
    return `Got it — I can help with booking. What's the best email for follow-up?\nAI_INTENT: {"tool":"update_field","field":"product_interest","value":"booking"}`;
  }

  return `Thanks for reaching out to ${shortName}. Tell me a little more about what you need, and I'll point you in the right direction.`;
}

function stubProvider(metered: boolean): AiProvider {
  return {
    name: metered ? "stub-test" : "stub-fallback",
    async complete(input: AiCallInput): Promise<AiCallResult> {
      const maxTokensUsed = clampMaxTokens(input.maxTokens);
      const text = stubAiReply(input.user, input.brand, input.brandShortName, input.knowledgeIds);
      (globalThis as MemoryGlobal).__yochatStubLastCall = {
        system: input.system,
        user: input.user,
        maxTokens: maxTokensUsed,
        knowledgeIds: input.knowledgeIds,
        at: new Date().toISOString(),
      };
      return {
        text,
        provider: metered ? "stub-test" : "stub-fallback",
        stubbed: true,
        maxTokensUsed,
        inputTokens: estimateTokens(input.system + input.user),
        outputTokens: estimateTokens(text),
      };
    },
  };
}

/** Test-only introspection: what did the stub last receive? */
export function getLastStubCall(): MemoryGlobal["__yochatStubLastCall"] {
  return (globalThis as MemoryGlobal).__yochatStubLastCall;
}

/**
 * One seam for the engine. Returns the provider plus whether calls
 * through it are metered against the AI token budget. The no-key
 * fallback is unmetered (no spend possible); TEST_MODE is metered
 * so the smoke suite exercises the budget gate with zero paid calls.
 */
export function getAiProvider(): { provider: AiProvider; metered: boolean } {
  if (isTestMode()) return { provider: stubProvider(true), metered: true };
  if (!process.env.NVIDIA_API_KEY) return { provider: stubProvider(false), metered: false };
  return { provider: nvidiaProvider(), metered: true };
}
