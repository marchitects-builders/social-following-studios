import { redisCommand, redisConfigured } from "@/lib/redis";
import type { Contact, MessageRecord, YochatState } from "@/lib/types";

/**
 * Wave 9 (item 1) — surgical blob extraction, phase 1: MIGRATION.
 *
 * Extracted from the monolithic state blob, in migration order:
 *   (a) conversation transcripts → keyed Lists per {brand}:{contactId}
 *       (RPUSH append, LRANGE read; message JSON carries createdAt, so
 *       ordering is by timestamp)
 *   (b) contacts → keyed JSON values per {brand}:{contactId}
 *   (c) brand config + flow definitions STAY as blobs (low-write, fine as-is)
 *
 * Migration discipline:
 * - DUAL-WRITE / write-through: every blob save (store.ts saveState) mirrors
 *   contacts and transcripts into the keyed structures via
 *   mirrorKeyedState(). The blob is still written and is still the source of
 *   truth during the transition — nothing is deleted from it yet.
 * - DUAL-READ: getKeyedContact/getKeyedTranscript read the new keyed
 *   structures first and fall back to the blob (with lazy backfill) when a
 *   key is missing.
 * - The in-memory fallback mirrors the SAME keyed structure (Maps standing
 *   in for Redis strings/lists/sets), so the migration is provable without
 *   live Redis.
 *
 * Redis layout (state-scope credentials):
 *   yochat:contact:{brand}:{contactId}            -> JSON contact
 *   yochat:contact-index                          -> SET of {brand}:{contactId}
 *   yochat:transcript:{brand}:{contactId}         -> LIST of JSON messages (chronological)
 *   yochat:transcript:{brand}:{contactId}:cursor  -> JSON {count, lastId}
 *   yochat:transcript-index                       -> SET of {brand}:{contactId}
 *
 * Cleanup of the blob copies is an explicit follow-up (documented in the
 * Wave 9 record), not part of this migration.
 */

const CONTACT_PREFIX = "yochat:contact:";
const CONTACT_INDEX = "yochat:contact-index";
const TRANSCRIPT_PREFIX = "yochat:transcript:";
const TRANSCRIPT_INDEX = "yochat:transcript-index";

function contactKey(brand: string, contactId: string): string {
  return `${CONTACT_PREFIX}${brand}:${contactId}`;
}
function transcriptKey(brand: string, contactId: string): string {
  return `${TRANSCRIPT_PREFIX}${brand}:${contactId}`;
}
function transcriptCursorKey(brand: string, contactId: string): string {
  return `${TRANSCRIPT_PREFIX}${brand}:${contactId}:cursor`;
}
function indexMember(brand: string, contactId: string): string {
  return `${brand}:${contactId}`;
}
function splitMember(member: string): { brand: string; contactId: string } {
  const separator = member.indexOf(":");
  return { brand: member.slice(0, separator), contactId: member.slice(separator + 1) };
}

export function keyedStorageMode(): "redis" | "memory" {
  return redisConfigured("state") ? "redis" : "memory";
}

// ─── In-memory mirror of the keyed structure ────────────────────────────────

type MemoryGlobal = typeof globalThis & {
  __yochatKeyedStrings?: Map<string, string>;
  __yochatKeyedLists?: Map<string, string[]>;
  __yochatKeyedSets?: Map<string, Set<string>>;
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}
function memStrings(): Map<string, string> {
  const global = memoryGlobal();
  global.__yochatKeyedStrings ??= new Map();
  return global.__yochatKeyedStrings;
}
function memLists(): Map<string, string[]> {
  const global = memoryGlobal();
  global.__yochatKeyedLists ??= new Map();
  return global.__yochatKeyedLists;
}
function memSets(): Map<string, Set<string>> {
  const global = memoryGlobal();
  global.__yochatKeyedSets ??= new Map();
  return global.__yochatKeyedSets;
}

// ─── Raw primitives (same semantics on both backends) ───────────────────────

async function rawGet(key: string): Promise<string | null> {
  if (!redisConfigured("state")) return memStrings().get(key) ?? null;
  return redisCommand<string | null>(["GET", key], "state");
}
async function rawSet(key: string, value: string): Promise<void> {
  if (!redisConfigured("state")) {
    memStrings().set(key, value);
    return;
  }
  await redisCommand(["SET", key, value], "state");
}
async function rawDel(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (!redisConfigured("state")) {
    for (const key of keys) {
      memStrings().delete(key);
      memLists().delete(key);
      memSets().delete(key);
    }
    return;
  }
  await redisCommand(["DEL", ...keys], "state");
}
async function rawSadd(key: string, member: string): Promise<void> {
  if (!redisConfigured("state")) {
    const set = memSets().get(key) ?? new Set<string>();
    set.add(member);
    memSets().set(key, set);
    return;
  }
  await redisCommand(["SADD", key, member], "state");
}
async function rawSrem(key: string, member: string): Promise<void> {
  if (!redisConfigured("state")) {
    memSets().get(key)?.delete(member);
    return;
  }
  await redisCommand(["SREM", key, member], "state");
}
async function rawSmembers(key: string): Promise<string[]> {
  if (!redisConfigured("state")) return [...(memSets().get(key) ?? [])];
  return redisCommand<string[]>(["SMEMBERS", key], "state");
}
async function rawRpush(key: string, values: string[]): Promise<void> {
  if (!values.length) return;
  if (!redisConfigured("state")) {
    const list = memLists().get(key) ?? [];
    list.push(...values);
    memLists().set(key, list);
    return;
  }
  await redisCommand(["RPUSH", key, ...values], "state");
}
async function rawLrange(key: string, start: number, stop: number): Promise<string[]> {
  if (!redisConfigured("state")) {
    const list = memLists().get(key) ?? [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(Math.max(0, start), Math.max(0, end));
  }
  return redisCommand<string[]>(["LRANGE", key, start, stop], "state");
}

/** List all {brand}:{contactId} members of the contact index (keyed layer). */
export async function listKeyedContactMembers(): Promise<Array<{ brand: string; contactId: string }>> {
  return (await rawSmembers(CONTACT_INDEX)).map(splitMember);
}

/** Write one contact's keyed JSON + index entry. Idempotent. */
export async function keyedSetContactRaw(contact: Contact): Promise<void> {
  const key = contactKey(contact.brand, contact.id);
  await rawSet(key, JSON.stringify(contact));
  await rawSadd(CONTACT_INDEX, indexMember(contact.brand, contact.id));
}

/** Remove a contact's keyed JSON, its transcript list + cursor, and index entries. Idempotent. */
export async function keyedDeleteContactRaw(brand: string, contactId: string): Promise<void> {
  await rawDel(contactKey(brand, contactId), transcriptKey(brand, contactId), transcriptCursorKey(brand, contactId));
  await rawSrem(CONTACT_INDEX, indexMember(brand, contactId));
  await rawSrem(TRANSCRIPT_INDEX, indexMember(brand, contactId));
}

export async function keyedGetContactRaw(brand: string, contactId: string): Promise<Contact | undefined> {
  const raw = await rawGet(contactKey(brand, contactId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Contact;
  } catch {
    return undefined;
  }
}

type TranscriptCursor = { count: number; lastId?: string };

async function readCursor(brand: string, contactId: string): Promise<TranscriptCursor | undefined> {
  const raw = await rawGet(transcriptCursorKey(brand, contactId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TranscriptCursor;
  } catch {
    return undefined;
  }
}

/**
 * Append-only transcript sync driven by a cursor ({count, lastId}).
 * - No cursor yet: full write of the supplied messages.
 * - Blob longer than cursor: append only the delta (no duplicates).
 * - Blob SHORTER than cursor (reset_test / delete_contact_data shrank it):
 *   rebuild the list from scratch so the keyed copy never keeps stale rows.
 */
export async function keyedSyncTranscriptRaw(
  brand: string,
  contactId: string,
  messages: MessageRecord[],
): Promise<void> {
  const key = transcriptKey(brand, contactId);
  const cursor = await readCursor(brand, contactId);
  const payload = (list: MessageRecord[]): string[] => list.map((message) => JSON.stringify(message));

  if (!cursor) {
    if (messages.length) await rawRpush(key, payload(messages));
    await rawSet(transcriptCursorKey(brand, contactId), JSON.stringify({ count: messages.length, lastId: messages.at(-1)?.id } satisfies TranscriptCursor));
    if (messages.length) await rawSadd(TRANSCRIPT_INDEX, indexMember(brand, contactId));
    return;
  }
  if (messages.length < cursor.count) {
    await rawDel(key);
    if (messages.length) await rawRpush(key, payload(messages));
    await rawSet(transcriptCursorKey(brand, contactId), JSON.stringify({ count: messages.length, lastId: messages.at(-1)?.id } satisfies TranscriptCursor));
    if (messages.length) await rawSadd(TRANSCRIPT_INDEX, indexMember(brand, contactId));
    else await rawSrem(TRANSCRIPT_INDEX, indexMember(brand, contactId));
    return;
  }
  if (messages.length > cursor.count) {
    // Fast path is only valid when the keyed list's first cursor.count rows
    // are exactly messages[0..cursor.count) in order. Equal timestamps can
    // shift the chronological sort (id tiebreak), so verify the prefix by ID
    // before appending — otherwise rebuild from scratch.
    const head = await rawLrange(key, 0, cursor.count - 1);
    const headIds = head.map((item) => {
      try {
        return (JSON.parse(item) as MessageRecord).id;
      } catch {
        return undefined;
      }
    });
    const prefixMatches =
      headIds.length === cursor.count &&
      messages.slice(0, cursor.count).every((message, index) => message.id === headIds[index]);
    if (prefixMatches) {
      await rawRpush(key, payload(messages.slice(cursor.count)));
      await rawSet(transcriptCursorKey(brand, contactId), JSON.stringify({ count: messages.length, lastId: messages.at(-1)?.id } satisfies TranscriptCursor));
      await rawSadd(TRANSCRIPT_INDEX, indexMember(brand, contactId));
      return;
    }
    await rawDel(key);
    if (messages.length) await rawRpush(key, payload(messages));
    await rawSet(transcriptCursorKey(brand, contactId), JSON.stringify({ count: messages.length, lastId: messages.at(-1)?.id } satisfies TranscriptCursor));
    if (messages.length) await rawSadd(TRANSCRIPT_INDEX, indexMember(brand, contactId));
    else await rawSrem(TRANSCRIPT_INDEX, indexMember(brand, contactId));
    return;
  }
  // Same count: the tail row may still have changed (edit/replace at the
  // same length). Rebuild when the last ID disagrees with the cursor.
  if (messages.at(-1)?.id !== cursor.lastId) {
    await rawDel(key);
    if (messages.length) await rawRpush(key, payload(messages));
    await rawSet(transcriptCursorKey(brand, contactId), JSON.stringify({ count: messages.length, lastId: messages.at(-1)?.id } satisfies TranscriptCursor));
    if (messages.length) await rawSadd(TRANSCRIPT_INDEX, indexMember(brand, contactId));
    else await rawSrem(TRANSCRIPT_INDEX, indexMember(brand, contactId));
  }
}

export async function keyedGetTranscriptRaw(
  brand: string,
  contactId: string,
  limit = 500,
): Promise<MessageRecord[]> {
  const capped = Math.min(2000, Math.max(1, limit));
  const raw = await rawLrange(transcriptKey(brand, contactId), -capped, -1);
  const messages: MessageRecord[] = [];
  for (const item of raw) {
    try {
      messages.push(JSON.parse(item) as MessageRecord);
    } catch {
      // Skip a corrupt row rather than failing the whole transcript read.
    }
  }
  return messages;
}

function sortMessages(messages: MessageRecord[]): MessageRecord[] {
  return [...messages].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Write-through mirror: called on EVERY blob save (store.ts saveState).
 * Contacts: full overwrite per contact + index diff (stale keyed contacts
 * and their transcripts are deleted). Transcripts: append-only cursor sync
 * per {brand}:{contact}, with rebuild when the blob shrank.
 */
export async function mirrorKeyedState(state: YochatState): Promise<void> {
  const desired = new Map<string, Contact>();
  for (const contact of Object.values(state.contacts)) {
    desired.set(indexMember(contact.brand, contact.id), contact);
  }
  const existing = await rawSmembers(CONTACT_INDEX);
  for (const member of existing) {
    if (!desired.has(member)) {
      const { brand, contactId } = splitMember(member);
      await keyedDeleteContactRaw(brand, contactId);
    }
  }
  for (const contact of desired.values()) {
    await keyedSetContactRaw(contact);
  }

  const conversationContact = new Map<string, { brand: string; contactId: string }>();
  for (const conversation of Object.values(state.conversations)) {
    conversationContact.set(conversation.id, { brand: conversation.brand, contactId: conversation.contactId });
  }
  const byContact = new Map<string, MessageRecord[]>();
  for (const message of state.messages) {
    const owner = conversationContact.get(message.conversationId);
    if (!owner) continue;
    const member = indexMember(owner.brand, owner.contactId);
    const list = byContact.get(member) ?? [];
    list.push(message);
    byContact.set(member, list);
  }
  for (const [member, messages] of byContact) {
    const { brand, contactId } = splitMember(member);
    await keyedSyncTranscriptRaw(brand, contactId, sortMessages(messages));
  }
  const transcriptMembers = await rawSmembers(TRANSCRIPT_INDEX);
  for (const member of transcriptMembers) {
    if (!desired.has(member)) {
      const { brand, contactId } = splitMember(member);
      await keyedDeleteContactRaw(brand, contactId);
    }
  }
}

/** Parity report: keyed copies vs the blob. Used by the migration-status probe. */
export async function keyedParityCheck(state: YochatState): Promise<{
  storageMode: "redis" | "memory";
  blobContacts: number;
  keyedContacts: number;
  transcriptKeys: number;
  contactMismatches: string[];
  transcriptCountMismatches: string[];
}> {
  const blobContacts = Object.keys(state.contacts).length;
  const keyedContacts = (await rawSmembers(CONTACT_INDEX)).length;
  const transcriptKeys = (await rawSmembers(TRANSCRIPT_INDEX)).length;
  const contactMismatches: string[] = [];
  const transcriptCountMismatches: string[] = [];

  const conversationContact = new Map<string, string>();
  for (const conversation of Object.values(state.conversations)) {
    conversationContact.set(conversation.id, indexMember(conversation.brand, conversation.contactId));
  }
  const blobTranscriptCounts = new Map<string, number>();
  for (const message of state.messages) {
    const member = conversationContact.get(message.conversationId);
    if (member) blobTranscriptCounts.set(member, (blobTranscriptCounts.get(member) ?? 0) + 1);
  }

  for (const contact of Object.values(state.contacts)) {
    const keyed = await keyedGetContactRaw(contact.brand, contact.id);
    if (!keyed || JSON.stringify(keyed) !== JSON.stringify(contact)) {
      contactMismatches.push(`${contact.brand}:${contact.id}`);
      continue;
    }
    const member = indexMember(contact.brand, contact.id);
    const keyedCount = (await keyedGetTranscriptRaw(contact.brand, contact.id, 2000)).length;
    const blobCount = blobTranscriptCounts.get(member) ?? 0;
    if (keyedCount !== blobCount) transcriptCountMismatches.push(member);
  }
  return {
    storageMode: keyedStorageMode(),
    blobContacts: blobContacts,
    keyedContacts,
    transcriptKeys,
    contactMismatches,
    transcriptCountMismatches,
  };
}
