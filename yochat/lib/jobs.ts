import { randomUUID } from "node:crypto";
import { getAiSpend, getDailyTokenBudget } from "@/lib/ai-budget";
import { heartbeat, logOps } from "@/lib/ops";
import { releaseSendSlot, reserveSendSlot } from "@/lib/rate-limit";
import { classifySendError } from "@/lib/send-errors";
import { addAnalytics, addAudit, getBrandConfig, loadState, mutateState } from "@/lib/store";
import type { BrandKey, Channel, DeliveryJob, MessageRecord, YochatState } from "@/lib/types";

export type DeliveryFunction = (job: DeliveryJob) => Promise<void>;

/**
 * Wave 2 (advisor rounds) — OUTBOUND SEND AUTHORIZATION "seatbelt".
 *
 * Checked before EVERY Meta send (queued jobs included). Stage 1 policy:
 * deny when the contact opted out, paused automation, sits in a human
 * handoff, or the brand/global system is paused. The takeover-race window
 * (human took over AFTER the job was queued) is closed here because the
 * check runs at send time, not queue time.
 *
 * Wave 9 (item 7): extended with the AI budget policy (Wave 5's per-brand
 * daily token budget denies AI-generated sends when exhausted) and an audit
 * record for EVERY authorization decision (allow/deny + reason), surfaced in
 * admin ops via the outbound_auth_log action.
 */
export type OutboundAuthContext = {
  brand: BrandKey;
  channel: Channel;
  recipientId: string;
  kind: DeliveryJob["kind"];
  contactId?: string;
  flowId?: string;
  /** Wave 9: set when the send carries AI-generated text (budget-gated). */
  aiGenerated?: boolean;
};

export type OutboundAuthResult = { allowed: boolean; reason?: string };

async function evaluateOutbound(auth: OutboundAuthContext): Promise<OutboundAuthResult> {
  if (auth.channel === "test") {
    return { allowed: false, reason: "test channel sends never reach Meta" };
  }
  const state = await loadState();
  if (state.settings.globalAutomationPaused) return { allowed: false, reason: "system paused" };
  const brand = await getBrandConfig(auth.brand);
  if (!brand.automationEnabled) return { allowed: false, reason: `brand ${auth.brand} paused` };

  const contact = auth.contactId
    ? state.contacts[auth.contactId]
    : Object.values(state.contacts).find(
        (candidate) => candidate.brand === auth.brand && candidate.channel === auth.channel && candidate.externalId === auth.recipientId,
      );
  if (contact) {
    // Wave 9 (item 4): tenant isolation — a contact's consent policy must never
    // bleed across brands. An explicit contactId from another brand is denied.
    if (contact.brand !== auth.brand) {
      return { allowed: false, reason: `contact ${contact.id} belongs to brand ${contact.brand}, not ${auth.brand}` };
    }
    if (contact.optedOut) return { allowed: false, reason: "contact opted out" };
    if (contact.automationPaused) return { allowed: false, reason: "automation paused for contact" };
    const conversation = Object.values(state.conversations).find(
      (candidate) => candidate.contactId === contact.id && candidate.status === "handoff",
    );
    if (conversation) return { allowed: false, reason: "conversation in human handoff" };
  }

  // Wave 9: AI budget policy. AI-generated sends are denied once the brand's
  // daily token budget is exhausted (read-only check here — the actual spend
  // reservation happens at AI call time in lib/ai-budget.ts). Brand-level, so
  // it applies with or without a contact record.
  if (auth.aiGenerated) {
    const [budget, used] = await Promise.all([getDailyTokenBudget(auth.brand), getAiSpend(auth.brand)]);
    if (used >= budget) {
      return { allowed: false, reason: `ai daily token budget exhausted (${used}/${budget} tokens)` };
    }
  }
  return { allowed: true };
}

export async function authorizeOutbound(auth: OutboundAuthContext): Promise<OutboundAuthResult> {
  const result = await evaluateOutbound(auth);
  await mutateState((state) => {
    addAudit(state, {
      action: "outbound.auth",
      actor: "system",
      target: auth.contactId ?? auth.recipientId,
      detail: {
        brand: auth.brand,
        channel: auth.channel,
        kind: auth.kind,
        flowId: auth.flowId,
        aiGenerated: auth.aiGenerated === true,
        allowed: result.allowed,
        reason: result.reason ?? "ok",
      },
    });
  });
  return result;
}

/** Hooks let the delivery layer (lib/meta.ts) plug in rate limiting etc. without a lib cycle. */
export type JobHooks = {
  /** Return false to requeue the job WITHOUT counting an attempt (e.g. rate-limited). */
  beforeSend?: (job: DeliveryJob) => Promise<boolean>;
  /** Called after a failed send so the hook can release resources (e.g. rate slot). */
  afterFailure?: (job: DeliveryJob, errorClass: string) => Promise<void>;
};

export const deliveryHooks: JobHooks = {
  beforeSend: async (job) => {
    const allowed = await reserveSendSlot(job.brand, job.channel);
    if (!allowed) {
      await logOps("warning", "delivery", `Rate limit reached for ${job.brand}/${job.channel}; send requeued`, {
        jobId: job.id,
        kind: job.kind,
      });
    }
    return allowed;
  },
  afterFailure: async (job, errorClass) => {
    await releaseSendSlot(job.brand, job.channel);
    if (errorClass === "auth") {
      await logOps("error", "delivery", `Meta auth failure for ${job.brand}/${job.channel}; check tokens`, {
        jobId: job.id,
      });
    }
  },
};

async function scheduleSequenceJobs(state: YochatState, now: Date): Promise<void> {
  for (const enrollment of Object.values(state.enrollments)) {
    if (enrollment.status !== "active" || new Date(enrollment.nextRunAt) > now) continue;
    const sequence = state.sequences[enrollment.sequenceId];
    const contact = state.contacts[enrollment.contactId];
    const step = sequence?.steps[enrollment.currentStep];
    if (!sequence?.enabled || !contact || !step || contact.optedOut || contact.automationPaused || contact.channel === "test") {
      enrollment.status = "cancelled";
      continue;
    }
    const lastInboundAge = now.getTime() - new Date(contact.lastSeenAt).getTime();
    if (lastInboundAge > 23 * 60 * 60 * 1000) {
      enrollment.status = "cancelled";
      continue;
    }
    const brand = await getBrandConfig(contact.brand);
    const accountId = contact.channel === "messenger" ? brand.pageId : brand.instagramId;
    const job: DeliveryJob = {
      id: randomUUID(),
      eventId: `sequence:${enrollment.id}:${step.id}`,
      brand: contact.brand,
      channel: contact.channel,
      accountId,
      recipientId: contact.externalId,
      text: step.text,
      kind: "sequence",
      sequenceEnrollmentId: enrollment.id,
      status: "pending",
      attempts: 0,
      dueAt: now.toISOString(),
      createdAt: now.toISOString(),
    };
    const conversation = Object.values(state.conversations).find(
      (candidate) => candidate.contactId === contact.id && candidate.accountId === accountId,
    );
    if (conversation) {
      const message: MessageRecord = {
        id: randomUUID(),
        conversationId: conversation.id,
        direction: "outbound",
        text: step.text,
        trigger: "message",
        status: "queued",
        createdAt: now.toISOString(),
        metadata: { sequenceId: sequence.id, stepId: step.id },
      };
      state.messages.push(message);
      job.messageId = message.id;
    }
    state.jobs[job.id] = job;
    enrollment.currentStep += 1;
    const next = sequence.steps[enrollment.currentStep];
    if (!next) enrollment.status = "completed";
    else enrollment.nextRunAt = new Date(now.getTime() + next.delayMinutes * 60_000).toISOString();
  }
}

export async function processDueJobs(
  deliver: DeliveryFunction,
  limit = 25,
  hooks: JobHooks = deliveryHooks,
): Promise<{ sent: number; failed: number; denied: number }> {
  await heartbeat("jobs");
  const dueJobs = await mutateState(async (state) => {
    const now = new Date();
    for (const job of Object.values(state.jobs)) {
      if (
        job.status === "processing" &&
        now.getTime() - new Date(job.lockedAt ?? job.createdAt).getTime() > 10 * 60_000
      ) {
        // Wave 4 (ZernFlow claim-before-send): a job stuck in "processing"
        // may have been sent by a worker that died before marking it "sent".
        // Retrying it risks a DUPLICATE customer-visible message, which is
        // worse than a false failure. Settle it as failed — NEVER reset to
        // pending — and mark the linked message failed so the inbox stops
        // showing it as queued. An operator verifies and retries manually.
        job.status = "failed";
        job.lockedAt = undefined;
        job.lastError =
          "Interrupted delivery attempt settled as failed to prevent a duplicate send — verify before retrying";
        if (job.messageId) {
          const message = state.messages.find((m) => m.id === job.messageId);
          if (message && message.status === "queued") {
            message.status = "failed";
          }
        }
        logOps("error", "jobs", `stuck delivery job ${job.id} settled as failed (anti-duplicate)`, {
          jobId: job.id,
          brand: job.brand,
          channel: job.channel,
          kind: job.kind,
        });
        addAudit(state, {
          action: "job.stuck_settled_failed",
          actor: "worker",
          target: job.id,
          detail: { brand: job.brand, channel: job.channel, kind: job.kind },
        });
      }
    }
    await scheduleSequenceJobs(state, now);
    const due = Object.values(state.jobs)
      .filter((job) => job.status === "pending" && new Date(job.dueAt) <= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, limit);
    for (const job of due) {
      job.status = "processing";
      job.attempts += 1;
      job.lockedAt = now.toISOString();
    }
    return structuredClone(due);
  });

  let sent = 0;
  let failed = 0;
  let denied = 0;
  for (const job of dueJobs) {
    const latest = (await loadState()).jobs[job.id];
    if (!latest || latest.status !== "processing") continue;

    // Seatbelt: authorization at SEND time closes the takeover race
    // (human took over / contact opted out after the job was queued).
    const auth = await authorizeOutbound({
      brand: job.brand,
      channel: job.channel,
      recipientId: job.recipientId,
      kind: job.kind,
      contactId: typeof job.metadata?.contactId === "string" ? job.metadata.contactId : undefined,
      flowId: typeof job.metadata?.flowId === "string" ? job.metadata.flowId : undefined,
      aiGenerated: job.metadata?.aiGenerated === true,
    });
    if (!auth.allowed) {
      await mutateState((state) => {
        const stored = state.jobs[job.id];
        if (!stored || stored.status !== "processing") return;
        stored.status = "cancelled";
        stored.lockedAt = undefined;
        stored.lastError = `Outbound denied: ${auth.reason ?? "policy"}`;
      });
      await logOps("warning", "delivery", `Outbound send denied for job ${job.id}`, {
        jobId: job.id,
        kind: job.kind,
        reason: auth.reason ?? "policy",
      });
      denied += 1;
      continue;
    }

    // Rate-limit gate: requeue WITHOUT counting an attempt when the brand is over its Meta send budget.
    if (hooks.beforeSend && !(await hooks.beforeSend(job))) {
      await mutateState((state) => {
        const stored = state.jobs[job.id];
        if (!stored || stored.status !== "processing") return;
        stored.status = "pending";
        stored.attempts = Math.max(0, stored.attempts - 1);
        stored.lockedAt = undefined;
        stored.dueAt = new Date(Date.now() + 15 * 60_000).toISOString();
        stored.lastError = "Rate limit reached; requeued without counting an attempt";
      });
      continue;
    }

    try {
      await deliver(job);
      sent += 1;
      await mutateState((state) => {
        const stored = state.jobs[job.id];
        if (!stored) return;
        stored.status = "sent";
        stored.lockedAt = undefined;
        const outbound = job.messageId
          ? state.messages.find((message) => message.id === job.messageId)
          : [...state.messages].reverse().find(
              (message) => message.direction === "outbound" && message.text === job.text && message.status === "queued",
            );
        if (outbound) outbound.status = "sent";
        const contact = Object.values(state.contacts).find(
          (candidate) => candidate.brand === job.brand && candidate.externalId === job.recipientId && candidate.channel === job.channel,
        );
        addAnalytics(state, {
          brand: job.brand,
          channel: job.channel,
          name: "reply_sent",
          contactId: contact?.id,
          metadata: { attempts: stored.attempts, commentReply: Boolean(job.commentId) },
        });
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error";
      const errorClass = classifySendError(error);
      if (hooks.afterFailure) await hooks.afterFailure(job, errorClass);
      await mutateState((state) => {
        const stored = state.jobs[job.id];
        if (!stored) return;
        stored.lastError = message;
        stored.lockedAt = undefined;

        // Error-class-aware retry policy (Wave 1): don't burn attempts on
        // failures that will never succeed, and recover smartly where possible.
        if (errorClass === "window_closed" || errorClass === "permanent" || errorClass === "auth") {
          stored.status = "failed";
        } else if (errorClass === "rate_limited") {
          // Requeue with delay WITHOUT counting an attempt; the slot was released.
          stored.status = "pending";
          stored.attempts = Math.max(0, stored.attempts - 1);
          stored.dueAt = new Date(Date.now() + 30 * 60_000).toISOString();
        } else if (errorClass === "template_rejected" && !stored.downgradeToText) {
          // One plain-text retry before normal backoff.
          stored.status = "pending";
          stored.attempts = Math.max(0, stored.attempts - 1);
          stored.downgradeToText = true;
          stored.dueAt = new Date(Date.now() + 60_000).toISOString();
        } else if (stored.attempts >= 5) {
          stored.status = "failed";
          if (stored.sequenceEnrollmentId && state.enrollments[stored.sequenceEnrollmentId]) {
            state.enrollments[stored.sequenceEnrollmentId].status = "cancelled";
          }
          const outbound = stored.messageId ? state.messages.find((item) => item.id === stored.messageId) : undefined;
          if (outbound) outbound.status = "failed";
        }
        else {
          stored.status = "pending";
          stored.dueAt = new Date(Date.now() + Math.min(30, 2 ** stored.attempts) * 60_000).toISOString();
        }
        const contact = Object.values(state.contacts).find(
          (candidate) => candidate.brand === job.brand && candidate.externalId === job.recipientId && candidate.channel === job.channel,
        );
        addAnalytics(state, {
          brand: job.brand,
          channel: job.channel,
          name: "reply_failed",
          contactId: contact?.id,
          metadata: { attempts: stored.attempts, error: message, errorClass },
        });
      });
    }
  }
  return { sent, failed, denied };
}
