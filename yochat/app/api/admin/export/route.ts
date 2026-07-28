import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadState } from "@/lib/store";
import type { BrandKey } from "@/lib/types";

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const brandValue = url.searchParams.get("brand");
  const brand = brandValue && allowedBrands.has(brandValue as BrandKey) ? (brandValue as BrandKey) : undefined;
  const state = await loadState();
  const contacts = Object.values(state.contacts).filter((contact) => !brand || contact.brand === brand);
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
  return new Response(JSON.stringify({
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    contacts,
    conversations,
    messages: state.messages.filter((message) => conversationIds.has(message.conversationId)),
    handoffs: Object.values(state.handoffs).filter((handoff) => contactIds.has(handoff.contactId)),
    sequences: Object.values(state.sequences).filter((sequence) => !brand || sequence.brand === brand),
    analytics: state.analytics.filter((event) => !brand || event.brand === brand),
    audits: state.audits,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="yochat-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
