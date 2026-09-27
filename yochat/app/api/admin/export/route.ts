import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getKeyedContact, getKeyedTranscript, loadState } from "@/lib/store";
import { listKeyedContactMembers } from "@/lib/store-keys";
import type { BrandKey, Contact, MessageRecord } from "@/lib/types";

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // War-room workstream (h), SEC-02 — CSV formula injection: contact fields
  // (name, username, email, tags) are attacker-influenced. Quoting alone does
  // NOT stop Excel/LibreOffice from evaluating a cell that starts with
  // = + - @ (or tab/CR). Prefix such cells with a single quote so they are
  // always treated as literal text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * War-room workstream (i) repairs:
 * - BK-01: the JSON backup now carries every YochatState section except the two
 *   deliberately excluded ones (brandSecrets — Wave 7 write-only; security —
 *   holds the admin password hash override). Previously flows, knowledgeDocs,
 *   campaigns (+ enrollments/activity/subscriptions), brandOverrides, jobs,
 *   enrollments, ai settings, and processedEventIds were silently omitted.
 * - BK-03: contacts and transcripts are read from the keyed layer first
 *   (the same dual-read discipline as the runtime: keyed, with blob fallback),
 *   unioned with any blob-only records. The backup no longer depends on blob
 *   integrity alone after the Wave 9 keyed migration.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const brandValue = url.searchParams.get("brand");
  const brand = brandValue && allowedBrands.has(brandValue as BrandKey) ? (brandValue as BrandKey) : undefined;
  const state = await loadState();

  // ── Contacts: keyed layer first (dual-read), blob union for stragglers ──
  const contactsById = new Map<string, Contact>();
  try {
    const members = await listKeyedContactMembers();
    for (const member of members) {
      if (brand && member.brand !== brand) continue;
      const contact = await getKeyedContact(member.brand as BrandKey, member.contactId);
      if (contact && (!brand || contact.brand === brand)) contactsById.set(contact.id, contact);
    }
  } catch {
    // Keyed layer unreadable: the blob union below still yields a full backup.
  }
  for (const contact of Object.values(state.contacts)) {
    if (brand && contact.brand !== brand) continue;
    if (!contactsById.has(contact.id)) contactsById.set(contact.id, contact);
  }
  const contacts = [...contactsById.values()];

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const rows = [
      ["brand", "channel", "name", "username", "email", "phone", "stage", "tags", "source", "first_seen", "last_seen"],
      ...contacts.map((contact) => [
        contact.brand,
        contact.channel,
        contact.name,
        contact.username,
        contact.email,
        contact.phone,
        contact.leadStage,
        contact.tags.join("; "),
        contact.source,
        contact.firstSeenAt,
        contact.lastSeenAt,
      ]),
    ];
    return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="yochat-contacts-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const contactIds = new Set(contacts.map((contact) => contact.id));
  const conversations = Object.values(state.conversations).filter((conversation) => contactIds.has(conversation.contactId));
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));

  // ── Transcripts: keyed lists first, blob union for anything missing ──
  const messagesById = new Map<string, MessageRecord>();
  try {
    for (const contact of contacts) {
      const transcript = await getKeyedTranscript(contact.brand, contact.id, 2000);
      for (const message of transcript) messagesById.set(message.id, message);
    }
  } catch {
    // Blob union below still runs.
  }
  for (const message of state.messages) {
    if (!conversationIds.has(message.conversationId)) continue;
    if (!messagesById.has(message.id)) messagesById.set(message.id, message);
  }
  const messages = [...messagesById.values()];

  const inBrand = <T extends { brand: BrandKey }>(items: T[]): T[] =>
    items.filter((item) => !brand || item.brand === brand);
  const ofContacts = <T extends { contactId: string }>(items: T[]): T[] =>
    items.filter((item) => contactIds.has(item.contactId));
  // WAR ROOM TI-03 (RH-24): audits carry cross-brand detail (e.g. outbound.auth
  // for other brands' recipients). A per-brand export includes only audits
  // explicitly scoped to that brand via detail.brand; unattributed audits stay
  // in the full (unscoped) export. Fail-closed: never guess attribution.
  const inBrandAudits = (items: typeof state.audits): typeof state.audits =>
    items.filter((audit) => !brand || (typeof audit.detail?.brand === "string" && audit.detail.brand === brand));

  return new Response(JSON.stringify({
    exportedAt: new Date().toISOString(),
    backupNotes: [
      "Contacts and transcripts are read from the keyed Redis structures first (dual-read with blob fallback), unioned with blob-only records.",
      "Deliberately excluded: brandSecrets (Wave 7 write-only secret store — re-enter secrets after any restore) and security (holds the admin password hash override — re-set the admin password after any restore).",
      "Per-brand exports (?brand=) scope audits to detail.brand (TI-03); audits without an explicit brand attribution appear only in the full unscoped export.",
      "There is no automated restore path: restoring means re-importing this JSON into state by hand (see RUNBOOK §7).",
    ],
    settings: state.settings,
    contacts,
    conversations,
    messages,
    handoffs: ofContacts(Object.values(state.handoffs)),
    sequences: inBrand(Object.values(state.sequences)),
    enrollments: ofContacts(Object.values(state.enrollments)),
    jobs: inBrand(Object.values(state.jobs)),
    campaigns: inBrand(Object.values(state.campaigns)),
    campaignEnrollments: ofContacts(Object.values(state.campaignEnrollments)),
    campaignActivity: ofContacts(state.campaignActivity),
    mailingListSubscriptions: ofContacts(Object.values(state.mailingListSubscriptions)),
    flows: inBrand(Object.values(state.flows)),
    knowledgeDocs: inBrand(Object.values(state.knowledgeDocs)),
    brandOverrides: brand ? { [brand]: state.brandOverrides[brand] } : state.brandOverrides,
    ai: state.ai,
    processedEventIds: state.processedEventIds,
    analytics: inBrand(state.analytics),
    audits: inBrandAudits(state.audits),
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="yochat-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
