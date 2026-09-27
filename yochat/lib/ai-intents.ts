import { randomUUID } from "node:crypto";
import { addAudit, loadState, mutateState } from "@/lib/store";
import type { AiProposedIntent, AiWriteLevel, BrandKey } from "@/lib/types";

/**
 * Wave 5 — L0–L3 AI write permissions + intent allowlist.
 *
 * The AI NEVER executes a database write directly. It may output a
 * proposed intent line (`AI_INTENT: {...}`); Next.js code intercepts it
 * and validates against this HARDCODED allowlist. Prompt-injection
 * attempts to write disallowed fields are REJECTED by this validator —
 * never by trusting the model.
 *
 * Levels (Round 4, ChatGPT + Gemini):
 * - L0: no writes (default for every brand).
 * - L1: enum-only low-risk fields (product_interest, inquiry_type).
 * - L2: L1 + lead_stage enum + safe tag add. Requires explicit operator opt-in.
 * - L3: L2 + internal note append. Requires explicit operator opt-in.
 * Identity fields (email, phone, name) are NEVER AI-writable at any level.
 */

export const NEVER_WRITABLE_FIELDS = new Set(["email", "phone", "name", "externalId", "username"]);

/** L1: field -> allowed enum values. */
const L1_ENUM_FIELDS: Record<string, string[]> = {
  product_interest: ["services", "pricing", "booking", "volunteering", "donation", "partnership", "event"],
  inquiry_type: ["question", "request", "feedback", "other"],
};

/** L2 additions: field -> allowed enum values. */
const L2_ENUM_FIELDS: Record<string, string[]> = {
  lead_stage: ["new", "engaged", "qualified", "booked"],
};

const MAX_FIELD_VALUE_LENGTH = 200;
const TAG_PATTERN = /^[a-z0-9-]{1,32}$/;

export type IntentValidation = {
  allowed: boolean;
  reason: string;
  level: AiWriteLevel;
};

export async function getAiWriteLevel(brand: BrandKey): Promise<AiWriteLevel> {
  const state = await loadState();
  return state.ai.writeLevels[brand] ?? 0;
}

export async function setAiWriteLevel(brand: BrandKey, level: AiWriteLevel, actor = "admin"): Promise<void> {
  if (![0, 1, 2, 3].includes(level)) throw new Error("level must be 0–3");
  await mutateState((state) => {
    state.ai.writeLevels[brand] = level;
    addAudit(state, { action: "ai.write_level.set", actor, target: brand, detail: { level } });
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIntent(raw: unknown): AiProposedIntent | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (raw.tool === "update_field" && typeof raw.field === "string" && typeof raw.value === "string") {
    return { tool: "update_field", field: raw.field, value: raw.value };
  }
  if (raw.tool === "add_note" && typeof raw.text === "string") {
    return { tool: "add_note", text: raw.text };
  }
  return undefined;
}

/**
 * Extracts a proposed intent from the model reply. Protocol: the model
 * may append ONE final line starting with "AI_INTENT:" followed by JSON.
 * Hardened (war-room AI-04): EVERY AI_INTENT: protocol line is stripped
 * from the customer-visible text — a model that emits several protocol
 * lines (or a malformed one) can never leak internal machinery to the
 * visitor. Only the LAST proposal is parsed (the protocol's final line).
 * `cleaned` is always trimmed, so a whitespace-only model reply collapses
 * to "" and the caller's empty-output fallback engages (war-room AI-03).
 * Returns the parsed intent (if any) and the reply with the line(s) removed.
 */
export function parseAiIntent(replyText: string): { intent?: AiProposedIntent; raw?: unknown; cleaned: string } {
  const lineRe = /^AI_INTENT:\s*(\{.*\})\s*$/gm;
  const proposals: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(replyText)) !== null) proposals.push(m[1]);
  const cleaned = replyText.replace(/^AI_INTENT:.*$/gm, "").trim();
  if (proposals.length === 0) return { cleaned };
  const rawJson = proposals[proposals.length - 1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { cleaned, raw: rawJson };
  }
  const intent = normalizeIntent(parsed);
  if (!intent) return { cleaned, raw: parsed };
  return { intent, cleaned };
}

export function validateAiIntent(brand: BrandKey, level: AiWriteLevel, raw: unknown): IntentValidation {
  const fail = (reason: string): IntentValidation => ({ allowed: false, reason, level });
  const intent = normalizeIntent(raw);
  if (!intent) return fail("unknown_tool_or_malformed_intent");
  if (level === 0) return fail("level_0_no_writes");

  if (intent.tool === "add_note") {
    if (level < 3) return fail("add_note_requires_level_3");
    if (!intent.text.trim() || intent.text.length > 500) return fail("note_text_invalid");
    return { allowed: true, reason: "ok", level };
  }

  const { field, value } = intent;
  if (NEVER_WRITABLE_FIELDS.has(field)) return fail(`identity_field_never_writable:${field}`);
  if (!field || field.length > 64) return fail("field_name_invalid");
  if (value.length > MAX_FIELD_VALUE_LENGTH) return fail("value_too_long");

  if (Object.hasOwn(L1_ENUM_FIELDS, field)) {
    return L1_ENUM_FIELDS[field].includes(value)
      ? { allowed: true, reason: "ok", level }
      : fail(`value_not_in_enum:${field}`);
  }
  if (level >= 2) {
    if (Object.hasOwn(L2_ENUM_FIELDS, field)) {
      return L2_ENUM_FIELDS[field].includes(value)
        ? { allowed: true, reason: "ok", level }
        : fail(`value_not_in_enum:${field}`);
    }
    if (field === "tag") {
      return TAG_PATTERN.test(value) ? { allowed: true, reason: "ok", level } : fail("tag_invalid");
    }
  }
  return fail(level >= 2 ? "field_not_allowlisted" : "field_requires_level_2");
}

export type IntentApplication = {
  kind: string;
  detail: string;
};

/**
 * Applies a VALIDATED intent. Callers must run validateAiIntent first;
 * this function re-checks the field tables defensively so a missed
 * validation can never reach the state write.
 */
export async function applyAiIntent(
  contactId: string,
  intent: AiProposedIntent,
  level: AiWriteLevel,
): Promise<IntentApplication> {
  return mutateState((state) => {
    const contact = state.contacts[contactId];
    if (!contact) throw new Error(`contact ${contactId} not found`);
    const now = new Date().toISOString();

    if (intent.tool === "add_note") {
      // Level gate re-checked here so a missed validation can never reach
      // the state write; identity fields never route through this tool.
      if (level < 3) throw new Error("add_note requires level 3");
      contact.notes.push({ id: randomUUID(), text: `[AI] ${intent.text.slice(0, 500)}`, author: "ai", createdAt: now });
      addAudit(state, { action: "ai.intent_applied", actor: "ai", target: contactId, detail: { tool: "add_note", level } });
      return { kind: "add_note", detail: "note appended" };
    }

    const { field, value } = intent;
    if (NEVER_WRITABLE_FIELDS.has(field)) throw new Error(`refusing identity field write: ${field}`);
    if (Object.hasOwn(L1_ENUM_FIELDS, field)) {
      if (!L1_ENUM_FIELDS[field].includes(value)) throw new Error("value not in enum");
      contact.fields[field] = value;
    } else if (level >= 2 && Object.hasOwn(L2_ENUM_FIELDS, field)) {
      if (!L2_ENUM_FIELDS[field].includes(value)) throw new Error("value not in enum");
      if (field === "lead_stage") contact.leadStage = value as typeof contact.leadStage;
      else contact.fields[field] = value;
    } else if (level >= 2 && field === "tag") {
      if (!TAG_PATTERN.test(value)) throw new Error("tag invalid");
      if (!contact.tags.includes(value)) contact.tags.push(value);
    } else {
      throw new Error("field not allowlisted");
    }
    addAudit(state, {
      action: "ai.intent_applied",
      actor: "ai",
      target: contactId,
      detail: { tool: "update_field", field, value, level },
    });
    return { kind: "update_field", detail: `${field}=${value}` };
  });
}

export async function auditIntentRejected(
  contactId: string,
  raw: unknown,
  reason: string,
): Promise<void> {
  await mutateState((state) => {
    addAudit(state, {
      action: "ai.intent_rejected",
      actor: "ai",
      target: contactId,
      detail: { reason, raw: typeof raw === "object" ? raw : String(raw).slice(0, 200) },
    });
  });
}
