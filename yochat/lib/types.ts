export type Channel = "instagram" | "messenger" | "test";

export type TriggerType =
  | "message"
  | "comment"
  | "story_reply"
  | "mention"
  | "postback"
  | "referral"
  | "follow"
  | "test";

export type Intent =
  | "greeting"
  | "pricing"
  | "services"
  | "booking"
  | "lead_capture"
  | "partnership"
  | "volunteer"
  | "donation"
  | "event"
  | "support"
  | "complaint"
  | "human"
  | "opt_out"
  | "opt_in"
  | "unknown";

export type BrandKey = "marchitects" | "social-following" | "aafc";

export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
};

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  triggers: TriggerType[];
  keywords: string[];
  intent?: Intent;
  response?: string;
  tags?: string[];
  startSequenceId?: string;
  createHandoff?: boolean;
  collect?: Array<"email" | "phone" | "name">;
};

export type BrandConfig = {
  key: BrandKey;
  automationEnabled: boolean;
  name: string;
  shortName: string;
  description: string;
  voice: string;
  disclosure: string;
  objectives: string[];
  pageId: string;
  instagramId: string;
  website?: string;
  bookingUrl?: string;
  handoffEmail?: string;
  knowledge: KnowledgeEntry[];
  rules: AutomationRule[];
};

export type IncomingEvent = {
  id: string;
  channel: Channel;
  accountId: string;
  senderId: string;
  trigger: TriggerType;
  text: string;
  timestamp: string;
  commentId?: string;
  mediaId?: string;
  username?: string;
  referral?: string;
  metadata?: Record<string, unknown>;
};

export type Contact = {
  id: string;
  brand: BrandKey;
  channel: Channel;
  externalId: string;
  username?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags: string[];
  fields: Record<string, string>;
  leadStage: "new" | "engaged" | "qualified" | "booked" | "customer" | "closed";
  optedOut: boolean;
  automationPaused: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  source?: string;
};

export type Conversation = {
  id: string;
  contactId: string;
  brand: BrandKey;
  channel: Channel;
  accountId: string;
  status: "open" | "handoff" | "closed";
  lastIntent: Intent;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound" | "internal";
  text: string;
  trigger: TriggerType;
  intent?: Intent;
  status: "received" | "queued" | "sent" | "failed" | "simulated" | "ignored";
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type Handoff = {
  id: string;
  conversationId: string;
  contactId: string;
  brand: BrandKey;
  reason: string;
  status: "open" | "assigned" | "resolved";
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type DeliveryJob = {
  id: string;
  eventId: string;
  brand: BrandKey;
  channel: Channel;
  accountId: string;
  recipientId: string;
  text: string;
  commentId?: string;
  messageId?: string;
  kind?: "automated" | "manual" | "sequence";
  sequenceEnrollmentId?: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  attempts: number;
  dueAt: string;
  createdAt: string;
  lockedAt?: string;
  lastError?: string;
};

export type SequenceStep = {
  id: string;
  delayMinutes: number;
  text: string;
};

export type SequenceDefinition = {
  id: string;
  brand: BrandKey;
  name: string;
  enabled: boolean;
  steps: SequenceStep[];
};

export type SequenceEnrollment = {
  id: string;
  sequenceId: string;
  contactId: string;
  currentStep: number;
  status: "active" | "completed" | "cancelled";
  nextRunAt: string;
  createdAt: string;
};

export type AnalyticsEvent = {
  id: string;
  brand: BrandKey;
  channel: Channel;
  name:
    | "message_received"
    | "reply_sent"
    | "reply_failed"
    | "lead_captured"
    | "handoff_created"
    | "opt_out"
    | "automation_triggered"
    | "sequence_started"
    | "sequence_cancelled"
    | "manual_reply"
    | "test_completed"
    | "campaign_started"
    | "campaign_reply_received"
    | "campaign_subscribed"
    | "campaign_duplicate_prevented";
  contactId?: string;
  conversationId?: string;
  value?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  action: string;
  actor: string;
  target?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

export type CampaignDefinition = {
  id: string;
  brand: BrandKey;
  name: string;
  mode: "test" | "active";
  status: "draft" | "beta" | "active" | "paused";
  audience: "test-only" | "selected-contacts" | "full-list";
  mailingListId: string;
  mailingListName: string;
  keyword: string;
  tag: string;
  initialMessage: string;
  confirmationMessage: string;
  fallbackMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignEnrollment = {
  id: string;
  campaignId: string;
  contactId: string;
  status: "awaiting_reply" | "needs_keyword" | "successful";
  initialMessageStatus: "simulated" | "sent" | "failed";
  responseStatus: "awaiting_reply" | "needs_keyword" | "successful";
  keywordRecognized: boolean;
  confirmationStatus: "not_sent" | "simulated" | "sent" | "failed";
  startedAt: string;
  repliedAt?: string;
  joinedAt?: string;
  lastReply?: string;
};

export type CampaignActivity = {
  id: string;
  campaignId: string;
  contactId: string;
  type:
    | "campaign_started"
    | "initial_message_delivered"
    | "reply_received"
    | "keyword_recognized"
    | "keyword_not_recognized"
    | "mailing_list_subscribed"
    | "duplicate_prevented"
    | "tag_applied"
    | "confirmation_sent"
    | "fallback_sent";
  status: "success" | "info" | "failed";
  detail: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type MailingListSubscription = {
  id: string;
  listId: string;
  listName: string;
  brand: BrandKey;
  contactId: string;
  identityKey: string;
  name?: string;
  email?: string;
  phone?: string;
  fields: Record<string, string>;
  tags: string[];
  joinedAt: string;
  sourceCampaignId: string;
  status: "subscribed";
};

export type YochatState = {
  version: 1;
  contacts: Record<string, Contact>;
  conversations: Record<string, Conversation>;
  messages: MessageRecord[];
  handoffs: Record<string, Handoff>;
  jobs: Record<string, DeliveryJob>;
  sequences: Record<string, SequenceDefinition>;
  enrollments: Record<string, SequenceEnrollment>;
  analytics: AnalyticsEvent[];
  audits: AuditRecord[];
  campaigns: Record<string, CampaignDefinition>;
  campaignEnrollments: Record<string, CampaignEnrollment>;
  campaignActivity: CampaignActivity[];
  mailingListSubscriptions: Record<string, MailingListSubscription>;
  brandOverrides: Partial<Record<BrandKey, Partial<BrandConfig>>>;
  processedEventIds: Record<string, string>;
  settings: {
    globalAutomationPaused: boolean;
    retentionDays: number;
  };
};

export type EngineResult = {
  event: IncomingEvent;
  brand: BrandConfig;
  contact: Contact;
  conversation: Conversation;
  intent: Intent;
  reply?: string;
  handoff?: Handoff;
  job?: DeliveryJob;
  ignored?: string;
};
