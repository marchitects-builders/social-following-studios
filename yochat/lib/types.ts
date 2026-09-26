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

/**
 * Wave 5 — structured knowledge object. Versioned, per-brand, operator-
 * maintained. The AI prompt-stuffing path draws ONLY from these objects
 * (no RAG, no embeddings until ~15,000 knowledge tokens). `id` is
 * "<brand>:<slug>"; citation ids rendered as "kb:<id>-v<version>".
 */
export type AiKnowledgeDoc = {
  id: string;
  brand: BrandKey;
  title: string;
  content: string;
  enabled: boolean;
  /** bumps on every content edit */
  version: number;
  updatedAt: string;
  /** operator-confirmed "still accurate" marker; null = never verified */
  lastVerifiedAt?: string;
};

/**
 * Wave 5 — AI write permission levels (advisor rounds 4, ChatGPT + Gemini).
 * L0 = no writes (default). L1 = enum-only low-risk fields.
 * L2/L3 exist but require explicit operator opt-in per brand (default off).
 * Identity fields (email, phone, name) are NEVER AI-writable at any level.
 */
export type AiWriteLevel = 0 | 1 | 2 | 3;

/** Wave 5 — the only write the AI may ever propose. Never executed directly. */
export type AiProposedIntent =
  | { tool: "update_field"; field: string; value: string }
  | { tool: "add_note"; text: string };

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
  /**
   * Wave 7: per-brand outbound-HTTP allowlist (hostnames, lowercase).
   * Outbound flow HTTP may ONLY hit allowlisted hosts — empty (default)
   * means deny-all. An entry matches the host exactly or any subdomain
   * ("api.example.com" allows "v2.api.example.com"). This is the PRIMARY
   * control for outbound HTTP; SSRF filtering is defense-in-depth.
   */
  httpAllowlist: string[];
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
  /** Wave 3: operator notes, newest last. */
  notes: ContactNote[];
  /**
   * Wave 4: an armed wait-for-reply. The run is paused at `waitNodeId` and
   * resumes at `resumeNodeId` (the wait node's `next`) on the next inbound
   * message, or at `nextTimeout` when `timeoutAt` passes. The run is always
   * resumed against the PINNED `flowVersion` snapshot — never the live flow.
   */
  activeFlow?: ActiveFlowWait;
  firstSeenAt: string;
  lastSeenAt: string;
  source?: string;
};

/** Wave 4 — a flow run paused at a `wait` node, awaiting reply or timeout. */
export type ActiveFlowWait = {
  flowId: string;
  /** pinned at arm time: resume never runs against a newer published version */
  flowVersion: number;
  waitNodeId: string;
  /** the wait node's `next`: where an inbound reply continues the run */
  resumeNodeId: string;
  /** the wait node's `nextTimeout`: where a timeout continues the run */
  timeoutNodeId?: string;
  runId: string;
  armedAt: string;
  timeoutAt: string;
  label?: string;
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
  /** Wave 3: when set, the scheduler auto-resolves the handoff and resumes automation at this time. */
  resumeAt?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type ContactNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
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
  /** Set after a template_rejected send: retry once as plain text. */
  downgradeToText?: boolean;
  metadata?: Record<string, unknown>;
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
    | "campaign_duplicate_prevented"
    | "flow_triggered"
    | "flow_resumed"
    | "flow_wait_armed"
    | "flow_completed";
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

export type CampaignActivity = {  id: string;
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
  /**
   * Wave 7: per-brand secret store for outbound integrations (brand key →
   * secret name → value). WRITE-ONLY: values are never returned by any read
   * API, never appear in flow definitions, and never appear in logs, audit
   * records, or execution traces. Resolution of {{secret:NAME}} happens at
   * execution time in server memory only.
   */
  brandSecrets: Record<string, Record<string, string>>;
  processedEventIds: Record<string, string>;
  flows: Record<string, FlowDefinition>;
  /** Wave 5: versioned AI knowledge objects (prompt stuffing source of truth). */
  knowledgeDocs: Record<string, AiKnowledgeDoc>;
  /** Wave 5: AI control plane settings (budgets, write levels). */
  ai: {
    /** per-brand daily token budget overrides; unset = default */
    dailyTokenBudgets: Partial<Record<BrandKey, number>>;
    /** per-brand AI write level; unset = 0 (no writes) */
    writeLevels: Partial<Record<BrandKey, AiWriteLevel>>;
  };
  settings: {
    globalAutomationPaused: boolean;
    retentionDays: number;
  };
  /**
   * Wave 9: admin security state. The admin password hash override (when the
   * operator changes the password at runtime via change_admin_password).
   * Unset = the ADMIN_PASSWORD env var is canonical. Changing it instantly
   * revokes every issued session cookie (the cookie embeds a substring of
   * the hash it was issued against; see lib/admin-auth.ts).
   */
  security: {
    adminPasswordHash: string | null;
    passwordChangedAt: string | null;
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

// ─── Wave 2: Flow automation engine (JSON graph, Stage 1 — no canvas) ───

export type FlowNodeType =
  | "trigger"
  | "send_text"
  | "condition"
  | "ai_response"
  | "update_contact"
  | "collect"
  | "delay"
  | "wait"
  | "handoff"
  | "http_request"
  | "end";

export type FlowTriggerConfig = {
  triggerTypes: TriggerType[];
  keywords?: string[];
  firstMessageOnly?: boolean;
};

export type FlowConditionPredicate = {
  kind: "contains" | "intent" | "has_tag" | "is_first_message" | "opted_out";
  /** contains: comma/space-separated keywords; intent: Intent name; has_tag: tag; others: ignored */
  value?: string;
};

export type FlowNodeConfig = {
  // trigger
  trigger?: FlowTriggerConfig;
  // send_text
  text?: string;
  quickReplies?: string[];
  // condition
  predicate?: FlowConditionPredicate;
  // apply_tag
  tags?: string[];
  // set_field
  fields?: Record<string, string>;
  // collect
  kinds?: Array<"email" | "phone" | "name">;
  // delay
  minutes?: number;
  // wait (Wave 4): pause the run until the contact replies or the timeout fires
  timeoutMinutes?: number;
  waitLabel?: string;
  // handoff
  reason?: string;
  // http_request (Wave 7): bounded outbound HTTP. url/headers/body support
  // {{contact.*}}/{{message}} interpolation AND {{secret:NAME}} placeholders
  // resolved at execution time from the brand's write-only secret store.
  httpMethod?: string;
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpBody?: string;
};

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  name?: string;
  config: FlowNodeConfig;
  /** default next node */
  next?: string;
  /** condition branches */
  nextTrue?: string;
  nextFalse?: string;
  /** collect branches */
  nextSuccess?: string;
  nextFailure?: string;
  /** wait node: node to run when the wait times out (the resume path is `next`) */
  nextTimeout?: string;
};

export type FlowCompiledTrigger = {
  flowId: string;
  version: number;
  triggerTypes: TriggerType[];
  keywords: string[];
  firstMessageOnly: boolean;
};

export type FlowVersionSnapshot = {
  version: number;
  publishedAt: string;
  publishedBy: string;
  nodes: Record<string, FlowNode>;
  entryNodeId: string;
  note?: string;
};

export type FlowDefinition = {
  id: string;
  brand: BrandKey;
  name: string;
  description?: string;
  status: "draft" | "published" | "archived";
  /** increments on every publish; 0 = never published */
  version: number;
  nodes: Record<string, FlowNode>;
  entryNodeId: string;
  compiledTriggers: FlowCompiledTrigger[];
  versions: FlowVersionSnapshot[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
};

export type FlowValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Wave 2 (advisor round 2): per-execution causality record — answers
 * "why did this person receive this message?" Stored OUTSIDE the main
 * state blob (see lib/flowruns.ts) so run history never bloats it.
 */
export type FlowRunStep = {
  nodeId: string;
  nodeType: string;
  nodeName?: string;
  detail?: string;
  branch?: string;
  at: string;
};

export type FlowRunRecord = {
  id: string;
  flowId: string;
  /** Pinned at execution time — a run is never resumed against "current flow" (version drift protection). */
  flowVersion: number;
  brand: BrandKey;
  contactId: string;
  conversationId: string;
  eventId: string;
  status: "started" | "waiting" | "completed";
  startedAt: string;
  completedAt?: string;
  stopReason?: string;
  steps: FlowRunStep[];
  actions: Array<{ kind: string; nodeId: string; detail?: string }>;
  replyPreview?: string;
};
