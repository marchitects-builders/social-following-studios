import { randomUUID } from "node:crypto";
import { getDefaultBrand } from "@/lib/brands";
import {
  AAFC_MAILING_LIST_BETA_ID,
  addAnalytics,
  loadState,
  mutateState,
} from "@/lib/store";
import type {
  BrandConfig,
  CampaignActivity,
  Contact,
  Conversation,
  EngineResult,
  IncomingEvent,
  MailingListSubscription,
  MessageRecord,
  YochatState,
} from "@/lib/types";

export const AAFC_BETA_TEST_CONTACT = {
  externalId: "aafc-mailing-list-beta-test",
  username: "aafc-beta-test",
  name: "AAFC Beta Test Contact",
  email: "aafc.beta.test@example.com",
  phone: "+1 202-555-0147",
};

function contactIdFor(senderId: string): string {
  return `aafc:test:${senderId}`;
}

function conversationIdFor(contactId: string): string {
  return `${contactId}:${getDefaultBrand("aafc").instagramId}`;
}

function enrollmentIdFor(contactId: string): string {
  return `${AAFC_MAILING_LIST_BETA_ID}:${contactId}`;
}

function addCampaignActivity(
  state: YochatState,
  activity: Omit<CampaignActivity, "id" | "createdAt">,
): CampaignActivity {
  const record: CampaignActivity = {
    ...activity,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  state.campaignActivity.push(record);
  return record;
}

export function normalizeCampaignReply(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchesAafcMailingListKeyword(value: string): boolean {
  return normalizeCampaignReply(value) === "mailing list";
}

function identityKeyFor(contact: Contact): string {
  if (contact.email) return `email:${contact.email.trim().toLocaleLowerCase("en-US")}`;
  if (contact.phone) return `phone:${contact.phone.replace(/\D/g, "")}`;
  return `contact:${contact.brand}:${contact.channel}:${contact.externalId}`;
}

function subscriptionKey(listId: string, identityKey: string): string {
  return `${listId}:${identityKey}`;
}

export async function resetAafcMailingListBetaTest(): Promise<void> {
  await mutateState((state) => {
    const contactId = contactIdFor(AAFC_BETA_TEST_CONTACT.externalId);
    const conversationId = conversationIdFor(contactId);
    delete state.contacts[contactId];
    delete state.conversations[conversationId];
    delete state.campaignEnrollments[enrollmentIdFor(contactId)];
    state.messages = state.messages.filter((message) => message.conversationId !== conversationId);
    state.campaignActivity = state.campaignActivity.filter(
      (activity) => !(activity.campaignId === AAFC_MAILING_LIST_BETA_ID && activity.contactId === contactId),
    );
    for (const [id, subscription] of Object.entries(state.mailingListSubscriptions)) {
      if (subscription.sourceCampaignId === AAFC_MAILING_LIST_BETA_ID && subscription.contactId === contactId) {
        delete state.mailingListSubscriptions[id];
      }
    }
    state.analytics = state.analytics.filter(
      (event) =>
        !(
          event.channel === "test" &&
          event.contactId === contactId &&
          String(event.metadata?.campaignId ?? "") === AAFC_MAILING_LIST_BETA_ID
        ),
    );
    for (const eventId of Object.keys(state.processedEventIds)) {
      if (eventId.startsWith("campaign:aafc-mailing-list-beta:")) delete state.processedEventIds[eventId];
    }
  });
}

export async function startAafcMailingListBetaTest(): Promise<{
  campaignId: string;
  contactId: string;
  conversationId: string;
  initialMessage: string;
  status: "delivered_test_mode";
}> {
  return mutateState((state) => {
    const campaign = state.campaigns[AAFC_MAILING_LIST_BETA_ID];
    if (!campaign) throw new Error("AAFC mailing-list beta campaign is not configured");
    if (campaign.mode !== "test" || campaign.audience !== "test-only") {
      throw new Error("AAFC mailing-list beta must remain in test-only mode");
    }

    const now = new Date().toISOString();
    const contactId = contactIdFor(AAFC_BETA_TEST_CONTACT.externalId);
    const conversationId = conversationIdFor(contactId);
    const contact: Contact = state.contacts[contactId] ?? {
      id: contactId,
      brand: "aafc",
      channel: "test",
      externalId: AAFC_BETA_TEST_CONTACT.externalId,
      username: AAFC_BETA_TEST_CONTACT.username,
      name: AAFC_BETA_TEST_CONTACT.name,
      email: AAFC_BETA_TEST_CONTACT.email,
      phone: AAFC_BETA_TEST_CONTACT.phone,
      tags: [],
      fields: {},
      leadStage: "engaged",
      optedOut: false,
      automationPaused: false,
      firstSeenAt: now,
      lastSeenAt: now,
      source: AAFC_MAILING_LIST_BETA_ID,
    };
    contact.username = AAFC_BETA_TEST_CONTACT.username;
    contact.name = AAFC_BETA_TEST_CONTACT.name;
    contact.email = AAFC_BETA_TEST_CONTACT.email;
    contact.phone = AAFC_BETA_TEST_CONTACT.phone;
    contact.lastSeenAt = now;
    contact.fields.campaignId = campaign.id;
    contact.fields.campaignStatus = "awaiting_reply";
    state.contacts[contactId] = contact;

    const conversation: Conversation = state.conversations[conversationId] ?? {
      id: conversationId,
      contactId,
      brand: "aafc",
      channel: "test",
      accountId: getDefaultBrand("aafc").instagramId,
      status: "open",
      lastIntent: "unknown",
      summary: "AAFC mailing-list beta invitation delivered",
      createdAt: now,
      updatedAt: now,
    };
    conversation.updatedAt = now;
    conversation.summary = "AAFC mailing-list beta invitation delivered";
    state.conversations[conversationId] = conversation;

    const enrollmentId = enrollmentIdFor(contactId);
    if (!state.campaignEnrollments[enrollmentId]) {
      state.campaignEnrollments[enrollmentId] = {
        id: enrollmentId,
        campaignId: campaign.id,
        contactId,
        status: "awaiting_reply",
        initialMessageStatus: "simulated",
        responseStatus: "awaiting_reply",
        keywordRecognized: false,
        confirmationStatus: "not_sent",
        startedAt: now,
      };
      const message: MessageRecord = {
        id: randomUUID(),
        conversationId,
        direction: "outbound",
        text: campaign.initialMessage,
        trigger: "test",
        status: "simulated",
        createdAt: now,
        metadata: {
          campaignId: campaign.id,
          campaignStage: "initial_message",
          deliveredTo: "internal_test_contact",
        },
      };
      state.messages.push(message);
      addCampaignActivity(state, {
        campaignId: campaign.id,
        contactId,
        type: "campaign_started",
        status: "success",
        detail: "Beta campaign started for the internal AAFC test contact.",
      });
      addCampaignActivity(state, {
        campaignId: campaign.id,
        contactId,
        type: "initial_message_delivered",
        status: "success",
        detail: "Initial campaign message delivered in internal test mode.",
        metadata: { message: campaign.initialMessage },
      });
      addAnalytics(state, {
        brand: "aafc",
        channel: "test",
        name: "campaign_started",
        contactId,
        conversationId,
        metadata: { campaignId: campaign.id, audience: campaign.audience },
      });
    }

    return {
      campaignId: campaign.id,
      contactId,
      conversationId,
      initialMessage: campaign.initialMessage,
      status: "delivered_test_mode" as const,
    };
  });
}

export async function processAafcMailingListCampaignReply(
  event: IncomingEvent,
  brand: BrandConfig,
): Promise<EngineResult | undefined> {
  if (brand.key !== "aafc") return undefined;

  return mutateState((state) => {
    const campaign = state.campaigns[AAFC_MAILING_LIST_BETA_ID];
    if (!campaign || campaign.status !== "beta" || campaign.mode !== "test" || event.channel !== "test") {
      return undefined;
    }

    const contactId = contactIdFor(event.senderId);
    const enrollment = state.campaignEnrollments[enrollmentIdFor(contactId)];
    const contact = state.contacts[contactId];
    const conversation = state.conversations[conversationIdFor(contactId)];
    if (!enrollment || !contact || !conversation || enrollment.campaignId !== campaign.id) return undefined;

    if (state.processedEventIds[event.id]) {
      return {
        event,
        brand,
        contact: structuredClone(contact),
        conversation: structuredClone(conversation),
        intent: "unknown",
        ignored: "duplicate_event",
      };
    }
    state.processedEventIds[event.id] = event.timestamp;

    const now = event.timestamp;
    contact.lastSeenAt = now;
    if (event.username) contact.username = event.username;
    const metadata = event.metadata ?? {};
    if (typeof metadata.name === "string" && metadata.name.trim()) contact.name = metadata.name.trim();
    if (typeof metadata.email === "string" && metadata.email.trim()) contact.email = metadata.email.trim();
    if (typeof metadata.phone === "string" && metadata.phone.trim()) contact.phone = metadata.phone.trim();

    const recognized = matchesAafcMailingListKeyword(event.text);
    const intent = recognized ? "lead_capture" : "unknown";
    const inbound: MessageRecord = {
      id: event.id,
      conversationId: conversation.id,
      direction: "inbound",
      text: event.text,
      trigger: event.trigger,
      intent,
      status: "received",
      createdAt: now,
      metadata: { ...metadata, campaignId: campaign.id, normalizedReply: normalizeCampaignReply(event.text) },
    };
    state.messages.push(inbound);
    addCampaignActivity(state, {
      campaignId: campaign.id,
      contactId,
      type: "reply_received",
      status: "success",
      detail: `YoChat received the reply: ${event.text}`,
      metadata: { normalizedReply: normalizeCampaignReply(event.text) },
    });
    addAnalytics(state, {
      brand: "aafc",
      channel: "test",
      name: "campaign_reply_received",
      contactId,
      conversationId: conversation.id,
      metadata: { campaignId: campaign.id, recognized },
    });

    enrollment.repliedAt = now;
    enrollment.lastReply = event.text;
    let reply: string;
    if (recognized) {
      addCampaignActivity(state, {
        campaignId: campaign.id,
        contactId,
        type: "keyword_recognized",
        status: "success",
        detail: `Keyword recognized after normalization: ${normalizeCampaignReply(event.text)}`,
      });

      const identityKey = identityKeyFor(contact);
      const key = subscriptionKey(campaign.mailingListId, identityKey);
      const existing = state.mailingListSubscriptions[key];
      const joinedAt = existing?.joinedAt ?? now;
      if (existing) {
        existing.name = contact.name ?? existing.name;
        existing.email = contact.email ?? existing.email;
        existing.phone = contact.phone ?? existing.phone;
        existing.fields = { ...existing.fields, ...contact.fields };
        existing.tags = Array.from(new Set([...existing.tags, campaign.tag]));
        addCampaignActivity(state, {
          campaignId: campaign.id,
          contactId,
          type: "duplicate_prevented",
          status: "success",
          detail: "Existing mailing-list subscription reused; no duplicate entry was created.",
          metadata: { subscriptionId: existing.id, identityKey },
        });
        addAnalytics(state, {
          brand: "aafc",
          channel: "test",
          name: "campaign_duplicate_prevented",
          contactId,
          conversationId: conversation.id,
          metadata: { campaignId: campaign.id, subscriptionId: existing.id },
        });
      } else {
        const subscription: MailingListSubscription = {
          id: randomUUID(),
          listId: campaign.mailingListId,
          listName: campaign.mailingListName,
          brand: "aafc",
          contactId,
          identityKey,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          fields: { ...contact.fields },
          tags: Array.from(new Set([...contact.tags, campaign.tag])),
          joinedAt,
          sourceCampaignId: campaign.id,
          status: "subscribed",
        };
        state.mailingListSubscriptions[key] = subscription;
        addCampaignActivity(state, {
          campaignId: campaign.id,
          contactId,
          type: "mailing_list_subscribed",
          status: "success",
          detail: `Contact added to ${campaign.mailingListName}.`,
          metadata: { subscriptionId: subscription.id, joinedAt },
        });
        addAnalytics(state, {
          brand: "aafc",
          channel: "test",
          name: "campaign_subscribed",
          contactId,
          conversationId: conversation.id,
          metadata: { campaignId: campaign.id, subscriptionId: subscription.id, joinedAt },
        });
      }

      if (!contact.tags.includes(campaign.tag)) {
        contact.tags.push(campaign.tag);
        addCampaignActivity(state, {
          campaignId: campaign.id,
          contactId,
          type: "tag_applied",
          status: "success",
          detail: `Applied tag: ${campaign.tag}`,
        });
      }
      contact.fields.mailingList = campaign.mailingListName;
      contact.fields.mailingListJoinedAt = joinedAt;
      contact.fields.mailingListStatus = "subscribed";
      contact.fields.campaignResponseStatus = "successful";
      contact.leadStage = contact.leadStage === "new" ? "engaged" : contact.leadStage;
      enrollment.status = "successful";
      enrollment.responseStatus = "successful";
      enrollment.keywordRecognized = true;
      enrollment.joinedAt = joinedAt;
      enrollment.confirmationStatus = "simulated";
      reply = campaign.confirmationMessage;
      addCampaignActivity(state, {
        campaignId: campaign.id,
        contactId,
        type: "confirmation_sent",
        status: "success",
        detail: "Confirmation message delivered in internal test mode.",
        metadata: { message: reply },
      });
    } else {
      enrollment.status = "needs_keyword";
      enrollment.responseStatus = "needs_keyword";
      enrollment.keywordRecognized = false;
      enrollment.confirmationStatus = "simulated";
      contact.fields.campaignResponseStatus = "needs_keyword";
      reply = campaign.fallbackMessage;
      addCampaignActivity(state, {
        campaignId: campaign.id,
        contactId,
        type: "keyword_not_recognized",
        status: "info",
        detail: `Reply did not equal the normalized keyword: ${normalizeCampaignReply(event.text)}`,
      });
      addCampaignActivity(state, {
        campaignId: campaign.id,
        contactId,
        type: "fallback_sent",
        status: "success",
        detail: "Keyword reminder delivered in internal test mode.",
        metadata: { message: reply },
      });
    }

    const outbound: MessageRecord = {
      id: randomUUID(),
      conversationId: conversation.id,
      direction: "outbound",
      text: reply,
      trigger: event.trigger,
      intent,
      status: "simulated",
      createdAt: new Date().toISOString(),
      metadata: {
        campaignId: campaign.id,
        campaignStage: recognized ? "confirmation" : "keyword_reminder",
        deliveredTo: "internal_test_contact",
      },
    };
    state.messages.push(outbound);
    conversation.lastIntent = intent;
    conversation.summary = recognized
      ? "AAFC mailing-list beta response successful"
      : "AAFC mailing-list beta waiting for exact keyword";
    conversation.updatedAt = now;

    return {
      event,
      brand,
      contact: structuredClone(contact),
      conversation: structuredClone(conversation),
      intent,
      reply,
    };
  });
}

export async function getAafcMailingListBetaReport() {
  const state = await loadState();
  const campaign = state.campaigns[AAFC_MAILING_LIST_BETA_ID];
  const contactId = contactIdFor(AAFC_BETA_TEST_CONTACT.externalId);
  const contact = state.contacts[contactId];
  const enrollment = state.campaignEnrollments[enrollmentIdFor(contactId)];
  const identityKey = contact ? identityKeyFor(contact) : undefined;
  const subscription =
    campaign && identityKey
      ? state.mailingListSubscriptions[subscriptionKey(campaign.mailingListId, identityKey)]
      : undefined;
  const activities = state.campaignActivity
    .filter((activity) => activity.campaignId === AAFC_MAILING_LIST_BETA_ID && activity.contactId === contactId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const conversation = state.conversations[conversationIdFor(contactId)];
  const messages = conversation
    ? state.messages.filter((message) => message.conversationId === conversation.id)
    : [];
  const errors: string[] = [];
  if (enrollment && enrollment.initialMessageStatus === "failed") errors.push("Initial message failed.");
  if (enrollment && enrollment.confirmationStatus === "failed") errors.push("Confirmation message failed.");

  return {
    campaign,
    testContact: contact
      ? {
          id: contact.id,
          name: contact.name,
          username: contact.username,
          email: contact.email,
          phone: contact.phone,
        }
      : undefined,
    initialMessageStatus: enrollment
      ? enrollment.initialMessageStatus === "simulated"
        ? "Delivered — internal test mode"
        : enrollment.initialMessageStatus
      : "Not started",
    replyReceived: activities.some((activity) => activity.type === "reply_received"),
    keywordRecognized: enrollment?.keywordRecognized ?? false,
    campaignResponseStatus: enrollment?.responseStatus ?? "not_started",
    mailingListSubscriptionStatus: subscription?.status ?? "not_subscribed",
    mailingListName: subscription?.listName ?? campaign?.mailingListName,
    joinedAt: subscription?.joinedAt,
    tagStatus: contact?.tags.includes(campaign?.tag ?? "") ? "applied" : "not_applied",
    tag: campaign?.tag,
    confirmationMessageStatus: enrollment
      ? enrollment.confirmationStatus === "simulated"
        ? "Delivered — internal test mode"
        : enrollment.confirmationStatus
      : "Not sent",
    subscriptionCountForIdentity: identityKey
      ? Object.values(state.mailingListSubscriptions).filter(
          (item) => item.listId === campaign?.mailingListId && item.identityKey === identityKey,
        ).length
      : 0,
    duplicatePrevented: activities.some((activity) => activity.type === "duplicate_prevented"),
    messages,
    activityLog: activities,
    errors,
  };
}
