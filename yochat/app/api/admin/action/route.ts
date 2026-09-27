import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminRequest, hashAdminPassword, isTestActionsEnabled, verifyAdminPassword } from "@/lib/admin-auth";
import { addAudit, deleteContactData, mutateState, resetTestData, updateBrandConfig } from "@/lib/store";
import { addContactNote, deleteContactNote, mergeContacts, setLeadStage } from "@/lib/handoffs";
import { verifyCsrfToken } from "@/lib/csrf";
import type { AutomationRule, BrandKey, DeliveryJob, Intent, KnowledgeEntry, SequenceDefinition, TriggerType } from "@/lib/types";

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
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Wave 9 (item 5): CSRF synchronizer token required on admin mutations.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
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
    const saveResult = await mutateState((state) => {
      const existing = state.sequences[sanitized.id];
      // WAR ROOM TI-02 (RH-05b): sequence ids live in one global keyspace.
      // Saving under another brand's id would silently hijack that brand's
      // automation. Reject cross-brand id reuse (same-brand overwrite stays
      // allowed — it is the normal edit path).
      if (existing && existing.brand !== sanitized.brand) {
        addAudit(state, {
          action: "sequence.cross_brand_save_denied",
          actor: "admin",
          target: sanitized.id,
          detail: { existingBrand: existing.brand, attemptedBrand: sanitized.brand },
        });
        return { error: `sequence id "${sanitized.id}" is owned by brand "${existing.brand}"` } as const;
      }
      state.sequences[sanitized.id] = sanitized;
      addAudit(state, { action: "sequence.saved", actor: "admin", target: sanitized.id });
      return { ok: true } as const;
    });
    if ("error" in saveResult) return NextResponse.json({ error: saveResult.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Wave 3: inbox CRM primitives. Business-rule violations surface as 400, never 500.
  if (action === "set_handoff_resume" && typeof body.handoffId === "string" && typeof body.minutes === "number") {
    const handoff = await mutateState((state) => {
      const record = state.handoffs[body.handoffId as string];
      if (!record || record.status === "resolved") return undefined;
      record.resumeAt = new Date(Date.now() + Math.max(0, body.minutes as number) * 60_000).toISOString();
      addAudit(state, { action: "handoff.resume_armed", actor: "admin", target: record.id, detail: { resumeAt: record.resumeAt } });
      return structuredClone(record);
    });
    if (!handoff) return NextResponse.json({ error: "handoff not found" }, { status: 404 });
    return NextResponse.json({ ok: true, handoff });
  }
  if (action === "add_contact_note" && typeof body.contactId === "string" && typeof body.text === "string") {
    try {
      const contact = await addContactNote(body.contactId, body.text);
      return NextResponse.json({ ok: true, contact });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "note failed" }, { status: 400 });
    }
  }
  if (action === "delete_contact_note" && typeof body.contactId === "string" && typeof body.noteId === "string") {
    try {
      const contact = await deleteContactNote(body.contactId, body.noteId);
      return NextResponse.json({ ok: true, contact });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "delete failed" }, { status: 400 });
    }
  }
  if (action === "set_lead_stage" && typeof body.contactId === "string" && typeof body.stage === "string") {
    try {
      const contact = await setLeadStage(body.contactId, body.stage);
      return NextResponse.json({ ok: true, contact });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "stage update failed" }, { status: 400 });
    }
  }
  if (action === "merge_contacts" && typeof body.primaryId === "string" && typeof body.secondaryId === "string") {
    try {
      const contact = await mergeContacts(body.primaryId, body.secondaryId);
      return NextResponse.json({ ok: true, contact });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "merge failed" }, { status: 400 });
    }
  }

  // Wave 5: per-brand AI controls. Legitimate production admin actions — NOT test-gated.
  if (action === "set_ai_budget" && typeof body.brand === "string" && allowedBrands.has(body.brand as BrandKey)) {
    // Wave 5: per-brand daily AI token budget (active cost control).
    const { setDailyTokenBudget, getDailyTokenBudget } = await import("@/lib/ai-budget");
    if (typeof body.tokens !== "number") return NextResponse.json({ error: "tokens must be a number" }, { status: 400 });
    try {
      const tokens = await setDailyTokenBudget(body.brand as BrandKey, body.tokens);
      return NextResponse.json({ ok: true, brand: body.brand, tokens, budget: await getDailyTokenBudget(body.brand as BrandKey) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "budget update failed" }, { status: 400 });
    }
  }
  if (action === "set_ai_write_level" && typeof body.brand === "string" && allowedBrands.has(body.brand as BrandKey)) {
    // Wave 5: per-brand AI write level L0–L3. L2/L3 = explicit operator opt-in.
    const { setAiWriteLevel, getAiWriteLevel } = await import("@/lib/ai-intents");
    const level = Number(body.level);
    if (![0, 1, 2, 3].includes(level)) return NextResponse.json({ error: "level must be 0–3" }, { status: 400 });
    await setAiWriteLevel(body.brand as BrandKey, level as 0 | 1 | 2 | 3);
    return NextResponse.json({ ok: true, brand: body.brand, level: await getAiWriteLevel(body.brand as BrandKey) });
  }

  // Wave 9 (item 6): runtime admin password change. Stores the new password's
  // hash in state.security; every session cookie issued against the OLD hash
  // is revoked instantly on the next request (ph substring mismatch). The
  // caller's own cookie is revoked too — log in again after this call.
  if (action === "change_admin_password" && typeof body.current === "string" && typeof body.new === "string") {
    const next = body.new as string;
    if (next.length < 8 || next.length > 200) {
      return NextResponse.json({ error: "new password must be 8–200 characters" }, { status: 400 });
    }
    const changed = await mutateState((state) => {
      if (!verifyAdminPassword(body.current as string, state.security.adminPasswordHash)) return false;
      state.security.adminPasswordHash = hashAdminPassword(next);
      state.security.passwordChangedAt = new Date().toISOString();
      addAudit(state, { action: "admin.password_changed", actor: "admin", detail: { sessionsRevoked: true } });
      return true;
    });
    if (!changed) return NextResponse.json({ error: "current password is incorrect" }, { status: 403 });
    return NextResponse.json({ ok: true, sessionsRevoked: true });
  }

  // Wave 4 test-only actions: simulate delivery-claim failure modes.
  // NEVER available in production — they corrupt real delivery state.
  // Wave 9 (item 9a): the gate is explicit about intent — non-production
  // ONLY. isTestActionsEnabled() checks NODE_ENV !== "production"; the
  // smoke harness separately sets YOCHAT_TEST_MODE=1 for the stubbed AI
  // provider, which is a different concern. Exactly these three actions
  // are test-only; every legitimate action above stays reachable in
  // production.
  if (!isTestActionsEnabled()) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
  if (action === "simulate_stuck_job" && (typeof body.jobId === "string" || typeof body.contactId === "string")) {
    // Marks a job "processing" with an 11-minute-old lock so the next cron
    // run treats it as a worker that died mid-claim. When no pending job
    // exists for the contact, synthesizes one (test fixture, swept by reset_test).
    const job = await mutateState((state) => {
      let target =
        typeof body.jobId === "string"
          ? state.jobs[body.jobId as string]
          : Object.values(state.jobs).find(
              (candidate) => candidate.status === "pending" && candidate.metadata?.contactId === body.contactId,
            );
      if (!target) {
        const contact = typeof body.contactId === "string" ? state.contacts[body.contactId as string] : undefined;
        if (!contact) return undefined;
        const id = randomUUID();
        target = {
          id,
          eventId: `test-fixture-${id}`,
          brand: contact.brand,
          channel: contact.channel,
          accountId: "test",
          recipientId: contact.externalId,
          text: "Wave 4 stuck-job fixture",
          kind: "automated",
          status: "pending",
          attempts: 0,
          dueAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          metadata: { probe: true, contactId: contact.id },
        } satisfies DeliveryJob;
        state.jobs[id] = target;
      }
      target.status = "processing";
      target.lockedAt = new Date(Date.now() - 11 * 60_000).toISOString();
      addAudit(state, { action: "job.stuck_simulated", actor: "admin", target: target.id });
      return structuredClone(target);
    });
    if (!job) return NextResponse.json({ error: "no job found to simulate" }, { status: 404 });
    return NextResponse.json({ ok: true, job });
  }
  if (action === "simulate_failed_job" && typeof body.brand === "string" && allowedBrands.has(body.brand as BrandKey)) {
    // Synthesizes a failed delivery job with a caller-supplied error string
    // (test fixture for send-error classification + analytics seeding).
    const brand = body.brand as BrandKey;
    const error = typeof body.error === "string" ? body.error.slice(0, 500) : "simulated failure";
    const job = await mutateState((state) => {
      const id = randomUUID();
      const record: DeliveryJob = {
        id,
        eventId: `test-fixture-${id}`,
        brand,
        channel: "messenger",
        accountId: "test",
        recipientId: "test",
        text: "Wave 4 failed-job fixture",
        kind: "automated",
        status: "failed",
        attempts: 1,
        dueAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lastError: error,
        metadata: { probe: true },
      };
      state.jobs[id] = record;
      addAudit(state, { action: "job.failed_simulated", actor: "admin", target: id, detail: { error } });
      return structuredClone(record);
    });
    return NextResponse.json({ ok: true, job });
  }
  if (action === "force_wait_timeout" && typeof body.contactId === "string") {
    // Pushes an armed flow wait's timeout into the past so the next cron
    // run fires the timeout branch immediately.
    // Wave 9: optional lastSeenHoursAgo ages the contact's lastSeenAt so the
    // 23h Meta-window guard (item 9b) can be exercised deterministically.
    const ageHours = typeof body.lastSeenHoursAgo === "number" ? Math.max(0, body.lastSeenHoursAgo) : 0;
    const wait = await mutateState((state) => {
      const contact = state.contacts[body.contactId as string];
      if (!contact?.activeFlow) return undefined;
      contact.activeFlow.timeoutAt = new Date(Date.now() - 60_000).toISOString();
      if (ageHours > 0) {
        contact.lastSeenAt = new Date(Date.now() - ageHours * 60 * 60_000).toISOString();
      }
      return structuredClone(contact.activeFlow);
    });
    if (!wait) return NextResponse.json({ error: "no armed wait on contact" }, { status: 404 });
    return NextResponse.json({ ok: true, wait });
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
