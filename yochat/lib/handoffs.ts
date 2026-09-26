import { randomUUID } from "node:crypto";
import { addAudit, mutateState } from "@/lib/store";
import type { Contact, YochatState } from "@/lib/types";

/**
 * Wave 3 — handoff resume timers + contact identity resolution.
 *
 * Timed auto-resume (ChatbotX pattern): an operator can arm a handoff with
 * resumeAt; the scheduler then resolves the handoff and hands automation
 * back to the bot. Merge: fold a duplicate contact record into a primary
 * contact (cross-channel identity resolution done explicitly by an operator).
 */

/** Resolve handoffs whose resumeAt has passed. Returns the count resumed. */
export async function processDueHandoffResumes(now = new Date()): Promise<number> {
  return mutateState((state) => {
    let resumed = 0;
    for (const handoff of Object.values(state.handoffs)) {
      if (handoff.status === "resolved" || !handoff.resumeAt) continue;
      if (new Date(handoff.resumeAt).getTime() > now.getTime()) continue;
      handoff.status = "resolved";
      handoff.resolvedAt = now.toISOString();
      handoff.resumeAt = undefined;
      const contact = state.contacts[handoff.contactId];
      const conversation = state.conversations[handoff.conversationId];
      if (contact) contact.automationPaused = false;
      if (conversation && conversation.status === "handoff") conversation.status = "open";
      addAudit(state, {
        action: "handoff.auto_resumed",
        actor: "scheduler",
        target: handoff.id,
        detail: { contactId: handoff.contactId },
      });
      resumed += 1;
    }
    return resumed;
  });
}

/**
 * Merge secondary into primary. Moves conversations/handoffs/enrollments/
 * subscriptions, unions tags + notes, fills missing scalar fields.
 * Both contacts must exist and share a brand. Runs inside one mutateState.
 */
export function mergeContactsInState(state: YochatState, primaryId: string, secondaryId: string, actor: string): void {
  if (primaryId === secondaryId) throw new Error("primary and secondary contacts must differ");
  const primary = state.contacts[primaryId];
  const secondary = state.contacts[secondaryId];
  if (!primary) throw new Error(`primary contact ${primaryId} not found`);
  if (!secondary) throw new Error(`secondary contact ${secondaryId} not found`);
  if (primary.brand !== secondary.brand) {
    throw new Error(`cannot merge contacts across brands (${primary.brand} vs ${secondary.brand})`);
  }

  const mergeScalar = (key: "name" | "email" | "phone" | "username") => {
    if (!primary[key] && secondary[key]) primary[key] = secondary[key] as string;
  };
  mergeScalar("name");
  mergeScalar("email");
  mergeScalar("phone");
  mergeScalar("username");
  for (const tag of secondary.tags) if (!primary.tags.includes(tag)) primary.tags.push(tag);
  for (const [key, value] of Object.entries(secondary.fields)) {
    if (primary.fields[key] === undefined) primary.fields[key] = value;
  }
  primary.notes.push(
    ...secondary.notes.map((note) => ({ ...note, text: `[merged from ${secondaryId}] ${note.text}` })),
  );
  if (new Date(secondary.firstSeenAt).getTime() < new Date(primary.firstSeenAt).getTime()) {
    primary.firstSeenAt = secondary.firstSeenAt;
  }
  if (new Date(secondary.lastSeenAt).getTime() > new Date(primary.lastSeenAt).getTime()) {
    primary.lastSeenAt = secondary.lastSeenAt;
  }

  const remap = (contactId: string) => (contactId === secondaryId ? primaryId : contactId);
  for (const conversation of Object.values(state.conversations)) {
    if (conversation.contactId === secondaryId) conversation.contactId = primaryId;
  }
  for (const handoff of Object.values(state.handoffs)) {
    handoff.contactId = remap(handoff.contactId);
  }
  for (const enrollment of Object.values(state.enrollments)) {
    enrollment.contactId = remap(enrollment.contactId);
  }
  for (const enrollment of Object.values(state.campaignEnrollments)) {
    enrollment.contactId = remap(enrollment.contactId);
  }
  for (const subscription of Object.values(state.mailingListSubscriptions)) {
    subscription.contactId = remap(subscription.contactId);
  }
  for (const event of state.analytics) {
    if (event.contactId === secondaryId) event.contactId = primaryId;
  }

  delete state.contacts[secondaryId];
  addAudit(state, {
    action: "contact.merged",
    actor,
    target: primaryId,
    detail: { secondaryId, brand: primary.brand },
  });
}

export async function mergeContacts(primaryId: string, secondaryId: string, actor = "admin"): Promise<Contact> {
  return mutateState((state) => {
    mergeContactsInState(state, primaryId, secondaryId, actor);
    return structuredClone(state.contacts[primaryId]);
  });
}

export async function addContactNote(contactId: string, text: string, author = "admin"): Promise<Contact> {
  const clean = text.trim().slice(0, 2000);
  if (!clean) throw new Error("note text is required");
  return mutateState((state) => {
    const contact = state.contacts[contactId];
    if (!contact) throw new Error(`contact ${contactId} not found`);
    contact.notes.push({ id: randomUUID(), text: clean, author: author.slice(0, 120), createdAt: new Date().toISOString() });
    addAudit(state, { action: "contact.note_added", actor: author, target: contactId });
    return structuredClone(contact);
  });
}

export async function deleteContactNote(contactId: string, noteId: string, actor = "admin"): Promise<Contact> {
  return mutateState((state) => {
    const contact = state.contacts[contactId];
    if (!contact) throw new Error(`contact ${contactId} not found`);
    const before = contact.notes.length;
    contact.notes = contact.notes.filter((note) => note.id !== noteId);
    if (contact.notes.length === before) throw new Error(`note ${noteId} not found`);
    addAudit(state, { action: "contact.note_deleted", actor, target: contactId, detail: { noteId } });
    return structuredClone(contact);
  });
}

const LEAD_STAGES = new Set(["new", "engaged", "qualified", "booked", "customer", "closed"]);

export async function setLeadStage(contactId: string, stage: string, actor = "admin"): Promise<Contact> {
  if (!LEAD_STAGES.has(stage)) throw new Error(`invalid lead stage "${stage}"`);
  return mutateState((state) => {
    const contact = state.contacts[contactId];
    if (!contact) throw new Error(`contact ${contactId} not found`);
    contact.leadStage = stage as Contact["leadStage"];
    addAudit(state, { action: "contact.stage_set", actor, target: contactId, detail: { stage } });
    return structuredClone(contact);
  });
}
