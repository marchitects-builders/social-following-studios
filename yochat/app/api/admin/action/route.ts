import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { addAudit, deleteContactData, mutateState, resetTestData, updateBrandConfig } from "@/lib/store";
import type { AutomationRule, BrandKey, Intent, KnowledgeEntry, SequenceDefinition, TriggerType } from "@/lib/types";

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);
const allowedTriggers = new Set<TriggerType>(["message", "comment", "story_reply", "mention", "postback", "referral", "follow", "test"]);
const allowedIntents = new Set<Intent>(["greeting", "pricing", "services", "booking", "lead_capture", "partnership", "volunteer", "donation", "event", "support", "complaint", "human", "opt_out", "opt_in", "unknown"]);

function safeKnowledge(value: unknown): KnowledgeEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 50).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<KnowledgeEntry>;
    if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.content !== "string") return [];
    return [{ id: item.id.slice(0, 100), title: item.title.slice(0, 160), content: item.content.slice(0, 5000), enabled: item.enabled !== false }];
  });
}

function safeRules(value: unknown): AutomationRule[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<AutomationRule>;
    if (typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.triggers) || !Array.isArray(item.keywords)) return [];
    return [{
      id: item.id.slice(0, 100),
      name: item.name.slice(0, 160),
      enabled: item.enabled !== false,
      triggers: item.triggers.filter((trigger): trigger is TriggerType => typeof trigger === "string" && allowedTriggers.has(trigger as TriggerType)).slice(0, 8),
      keywords: item.keywords.filter((keyword): keyword is string => typeof keyword === "string").slice(0, 50).map((keyword) => keyword.slice(0, 120)),
      intent: typeof item.intent === "string" && allowedIntents.has(item.intent as Intent) ? (item.intent as Intent) : undefined,
      response: typeof item.response === "string" ? item.response.slice(0, 1500) : undefined,
      tags: item.tags?.filter((tag): tag is string => typeof tag === "string").slice(0, 20).map((tag) => tag.slice(0, 80)),
      startSequenceId: typeof item.startSequenceId === "string" ? item.startSequenceId.slice(0, 100) : undefined,
      createHandoff: item.createHandoff === true,
      collect: item.collect?.filter((field): field is "email" | "phone" | "name" => ["email", "phone", "name"].includes(String(field))).slice(0, 3),
    } as AutomationRule];
  });
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;

  if (action === "reset_test") {
    await resetTestData();
    return NextResponse.json({ ok: true });
  }
  if (action === "delete_contact" && typeof body.contactId === "string") {
    return NextResponse.json({ ok: await deleteContactData(body.contactId) });
  }
  if (action === "update_brand" && typeof body.brand === "string" && allowedBrands.has(body.brand as BrandKey)) {
    const brand = body.brand as BrandKey;
    const update: Record<string, unknown> = {};
    if (typeof body.voice === "string") update.voice = body.voice.slice(0, 2000);
    if (typeof body.description === "string") update.description = body.description.slice(0, 3000);
    if (typeof body.disclosure === "string") update.disclosure = body.disclosure.slice(0, 1000);
    const website = safeUrl(body.website);
    const bookingUrl = safeUrl(body.bookingUrl);
    if (website !== undefined) update.website = website;
    if (bookingUrl !== undefined) update.bookingUrl = bookingUrl;
    if (typeof body.automationEnabled === "boolean") update.automationEnabled = body.automationEnabled;
    const knowledge = safeKnowledge(body.knowledge);
    const rules = safeRules(body.rules);
    if (knowledge) update.knowledge = knowledge;
    if (rules) update.rules = rules;
    return NextResponse.json({ ok: true, brand: await updateBrandConfig(brand, update) });
  }
  if (action === "set_global_pause" && typeof body.paused === "boolean") {
    await mutateState((state) => {
      state.settings.globalAutomationPaused = body.paused as boolean;
      addAudit(state, { action: body.paused ? "system.paused" : "system.resumed", actor: "admin" });
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "set_retention" && typeof body.days === "number") {
    const days = Math.min(365, Math.max(7, Math.round(body.days)));
    await mutateState((state) => {
      state.settings.retentionDays = days;
      addAudit(state, { action: "retention.updated", actor: "admin", detail: { days } });
    });
    return NextResponse.json({ ok: true, days });
  }
  if (action === "resolve_handoff" && typeof body.handoffId === "string") {
    await mutateState((state) => {
      const handoff = state.handoffs[body.handoffId as string];
      if (!handoff) return;
      handoff.status = "resolved";
      handoff.resolvedAt = new Date().toISOString();
      const contact = state.contacts[handoff.contactId];
      const conversation = state.conversations[handoff.conversationId];
      if (contact) contact.automationPaused = false;
      if (conversation) conversation.status = "open";
      addAudit(state, { action: "handoff.resolved", actor: "admin", target: handoff.id });
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "assign_handoff" && typeof body.handoffId === "string") {
    await mutateState((state) => {
      const handoff = state.handoffs[body.handoffId as string];
      if (!handoff || handoff.status === "resolved") return;
      handoff.status = "assigned";
      handoff.assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.slice(0, 120) : "Rashida";
      addAudit(state, { action: "handoff.assigned", actor: "admin", target: handoff.id, detail: { assignedTo: handoff.assignedTo } });
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "toggle_contact" && typeof body.contactId === "string") {
    await mutateState((state) => {
      const contact = state.contacts[body.contactId as string];
      if (!contact) return;
      contact.automationPaused = !contact.automationPaused;
      addAudit(state, { action: contact.automationPaused ? "contact.paused" : "contact.resumed", actor: "admin", target: contact.id });
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "retry_job" && typeof body.jobId === "string") {
    await mutateState((state) => {
      const job = state.jobs[body.jobId as string];
      if (!job) return;
      job.status = "pending";
      job.dueAt = new Date().toISOString();
      job.lastError = undefined;
      addAudit(state, { action: "job.retried", actor: "admin", target: job.id });
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "save_sequence" && body.sequence && typeof body.sequence === "object") {
    const sequence = body.sequence as SequenceDefinition;
    if (!sequence.id || !sequence.brand || !allowedBrands.has(sequence.brand) || !sequence.name || !Array.isArray(sequence.steps)) {
      return NextResponse.json({ error: "Invalid sequence" }, { status: 400 });
    }
    const sanitized: SequenceDefinition = {
      id: sequence.id.slice(0, 100),
      brand: sequence.brand,
      name: sequence.name.slice(0, 160),
      enabled: sequence.enabled !== false,
      steps: sequence.steps.slice(0, 10).flatMap((step) => {
        if (!step || typeof step.text !== "string" || typeof step.delayMinutes !== "number") return [];
        return [{ id: step.id?.slice(0, 100) || randomUUID(), delayMinutes: Math.min(1320, Math.max(1, Math.round(step.delayMinutes))), text: step.text.slice(0, 1000) }];
      }),
    };
    await mutateState((state) => {
      state.sequences[sanitized.id] = sanitized;
      addAudit(state, { action: "sequence.saved", actor: "admin", target: sanitized.id });
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
