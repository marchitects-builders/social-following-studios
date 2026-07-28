import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { processDueJobs } from "@/lib/jobs";
import { deliverMetaJob } from "@/lib/meta";
import { addAnalytics, addAudit, loadState, mutateState } from "@/lib/store";
import type { DeliveryJob, MessageRecord } from "@/lib/types";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { conversationId?: string; text?: string };
  const text = body.text?.trim().slice(0, 1000);
  if (!body.conversationId || !text) return NextResponse.json({ error: "Conversation and reply are required" }, { status: 400 });

  const created = await mutateState((state) => {
    const conversation = state.conversations[body.conversationId as string];
    const contact = conversation ? state.contacts[conversation.contactId] : undefined;
    if (!conversation || !contact) return { error: "Conversation not found" } as const;
    if (contact.channel === "test") return { error: "Test conversations cannot send real messages" } as const;
    if (contact.optedOut) return { error: "This contact has opted out" } as const;
    if (Date.now() - new Date(contact.lastSeenAt).getTime() > 23 * 60 * 60 * 1000) {
      return { error: "The Meta messaging window has closed" } as const;
    }

    const now = new Date().toISOString();
    const message: MessageRecord = {
      id: randomUUID(),
      conversationId: conversation.id,
      direction: "outbound",
      text,
      trigger: "message",
      status: "queued",
      createdAt: now,
      metadata: { manual: true },
    };
    const job: DeliveryJob = {
      id: randomUUID(),
      eventId: `manual:${message.id}`,
      brand: contact.brand,
      channel: contact.channel,
      accountId: conversation.accountId,
      recipientId: contact.externalId,
      text,
      messageId: message.id,
      kind: "manual",
      status: "pending",
      attempts: 0,
      dueAt: now,
      createdAt: now,
    };
    state.messages.push(message);
    state.jobs[job.id] = job;
    conversation.updatedAt = now;
    conversation.summary = `Manual reply: ${text.slice(0, 100)}`;
    contact.automationPaused = true;
    for (const enrollment of Object.values(state.enrollments)) {
      if (enrollment.contactId === contact.id && enrollment.status === "active") enrollment.status = "cancelled";
    }
    addAnalytics(state, {
      brand: contact.brand,
      channel: contact.channel,
      name: "manual_reply",
      contactId: contact.id,
      conversationId: conversation.id,
    });
    addAudit(state, { action: "reply.manual", actor: "admin", target: conversation.id });
    return { jobId: job.id } as const;
  });

  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
  await processDueJobs(deliverMetaJob);
  const job = (await loadState()).jobs[created.jobId];
  return NextResponse.json({ ok: job?.status === "sent", status: job?.status ?? "unknown", error: job?.lastError });
}
