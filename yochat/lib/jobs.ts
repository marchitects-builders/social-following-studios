import { randomUUID } from "node:crypto";
import { addAnalytics, getBrandConfig, loadState, mutateState } from "@/lib/store";
import type { DeliveryJob, MessageRecord, YochatState } from "@/lib/types";

export type DeliveryFunction = (job: DeliveryJob) => Promise<void>;

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

export async function processDueJobs(deliver: DeliveryFunction, limit = 25): Promise<{ sent: number; failed: number }> {
  const dueJobs = await mutateState(async (state) => {
    const now = new Date();
    for (const job of Object.values(state.jobs)) {
      if (
        job.status === "processing" &&
        now.getTime() - new Date(job.lockedAt ?? job.createdAt).getTime() > 10 * 60_000
      ) {
        job.status = "pending";
        job.dueAt = now.toISOString();
        job.lastError = "Recovered after an interrupted delivery attempt";
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
  for (const job of dueJobs) {
    const latest = (await loadState()).jobs[job.id];
    if (!latest || latest.status !== "processing") continue;
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
      await mutateState((state) => {
        const stored = state.jobs[job.id];
        if (!stored) return;
        stored.lastError = message;
        stored.lockedAt = undefined;
        if (stored.attempts >= 5) {
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
          metadata: { attempts: stored.attempts, error: message },
        });
      });
    }
  }
  return { sent, failed };
}
