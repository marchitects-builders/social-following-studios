import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadState } from "@/lib/store";
import { listFlowRunsForContact } from "@/lib/flowruns";

/**
 * Wave 3 — per-contact timeline for the inbox: messages, handoffs, notes,
 * flow execution records (causality: "why did this person receive this
 * message?"), and analytics events for one contact, newest first.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contactId = new URL(request.url).searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const state = await loadState();
  const contact = state.contacts[contactId];
  if (!contact) return NextResponse.json({ error: `contact ${contactId} not found` }, { status: 404 });

  const conversationIds = new Set(
    Object.values(state.conversations)
      .filter((conversation) => conversation.contactId === contactId)
      .map((conversation) => conversation.id),
  );
  const messages = state.messages
    .filter((message) => conversationIds.has(message.conversationId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);
  const handoffs = Object.values(state.handoffs)
    .filter((handoff) => handoff.contactId === contactId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const events = state.analytics
    .filter((event) => event.contactId === contactId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);

  return NextResponse.json({
    contact,
    conversations: [...conversationIds].map((id) => state.conversations[id]).filter(Boolean),
    messages,
    handoffs,
    notes: contact.notes,
    flowRuns: await listFlowRunsForContact(contactId, 50),
    events,
  });
}
