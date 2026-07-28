import { randomUUID } from "node:crypto";
import { getDefaultBrand, getDefaultBrands } from "@/lib/brands";
import type {
  AnalyticsEvent,
  AuditRecord,
  BrandConfig,
  BrandKey,
  CampaignDefinition,
  Contact,
  SequenceDefinition,
  YochatState,
} from "@/lib/types";

const STATE_KEY = "yochat:state:v1";
const LOCK_KEY = "yochat:state:lock";

export const AAFC_MAILING_LIST_BETA_ID = "aafc-mailing-list-beta";

function defaultCampaigns(): Record<string, CampaignDefinition> {
  const now = new Date().toISOString();
  return {
    [AAFC_MAILING_LIST_BETA_ID]: {
      id: AAFC_MAILING_LIST_BETA_ID,
      brand: "aafc",
      name: "AAFC — YoChat Mailing List Beta",
      mode: "test",
      status: "beta",
      audience: "test-only",
      mailingListId: "aafc-mailing-list",
      mailingListName: "AAFC Mailing List",
      keyword: "MAILING LIST",
      tag: "YoChat Mailing List Beta",
      initialMessage: "Reply MAILING LIST to join our mailing list.",
      confirmationMessage:
        "You’re officially on the mailing list. We’ll keep you updated with new announcements, opportunities, and important information.",
      fallbackMessage: "To join the mailing list, reply MAILING LIST.",
      createdAt: now,
      updatedAt: now,
    },
  };
}

const defaultSequences: Record<string, SequenceDefinition> = {
  "marchitects-consultation": {
    id: "marchitects-consultation",
    brand: "marchitects",
    name: "Consultation follow-up",
    enabled: true,
    steps: [
      { id: "m1", delayMinutes: 30, text: "Quick follow-up: what is the biggest bottleneck in your current growth system?" },
      { id: "m2", delayMinutes: 720, text: "If it helps, I can organize your goals into a short automation audit for Rashida to review." },
    ],
  },
  "social-growth": {
    id: "social-growth",
    brand: "social-following",
    name: "Social growth nurture",
    enabled: true,
    steps: [
      { id: "s1", delayMinutes: 30, text: "Which result matters most right now: reach, leads, bookings, or sales?" },
      { id: "s2", delayMinutes: 720, text: "I can help turn that goal into a simple content-to-conversation plan whenever you’re ready." },
    ],
  },
  "aafc-interest": {
    id: "aafc-interest",
    brand: "aafc",
    name: "AAFC interest follow-up",
    enabled: true,
    steps: [
      { id: "a1", delayMinutes: 60, text: "Thank you again for reaching out to AAFC. What city are you in and how would you most like to participate?" },
    ],
  },
};

export function emptyState(): YochatState {
  return {
    version: 1,
    contacts: {},
    conversations: {},
    messages: [],
    handoffs: {},
    jobs: {},
    sequences: structuredClone(defaultSequences),
    enrollments: {},
    analytics: [],
    audits: [],
    campaigns: defaultCampaigns(),
    campaignEnrollments: {},
    campaignActivity: [],
    mailingListSubscriptions: {},
    brandOverrides: {},
    processedEventIds: {},
    settings: {
      globalAutomationPaused: false,
      retentionDays: 90,
    },
  };
}

type MemoryGlobal = typeof globalThis & {
  __yochatMemoryState?: YochatState;
  __yochatMutationChain?: Promise<void>;
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}

function redisCredentials(): { url?: string; token?: string } {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  };
}

function redisConfigured(): boolean {
  const { url, token } = redisCredentials();
  return Boolean(url && token);
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const { url, token } = redisCredentials();
  if (!url || !token) throw new Error("Redis is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis REST returned HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result as T;
}

function normalizeState(value: Partial<YochatState> | null): YochatState {
  const base = emptyState();
  if (!value) return base;
  return {
    ...base,
    ...value,
    contacts: value.contacts ?? {},
    conversations: value.conversations ?? {},
    messages: value.messages ?? [],
    handoffs: value.handoffs ?? {},
    jobs: value.jobs ?? {},
    sequences: { ...base.sequences, ...(value.sequences ?? {}) },
    enrollments: value.enrollments ?? {},
    analytics: value.analytics ?? [],
    audits: value.audits ?? [],
    campaigns: { ...base.campaigns, ...(value.campaigns ?? {}) },
    campaignEnrollments: value.campaignEnrollments ?? {},
    campaignActivity: value.campaignActivity ?? [],
    mailingListSubscriptions: value.mailingListSubscriptions ?? {},
    brandOverrides: value.brandOverrides ?? {},
    processedEventIds: value.processedEventIds ?? {},
    settings: {
      ...base.settings,
      ...(value.settings ?? {}),
    },
  };
}

export async function loadState(): Promise<YochatState> {
  if (redisConfigured()) {
    const encoded = await redisCommand<string | null>(["GET", STATE_KEY]);
    return normalizeState(encoded ? (JSON.parse(encoded) as Partial<YochatState>) : null);
  }

  const global = memoryGlobal();
  global.__yochatMemoryState ??= emptyState();
  return structuredClone(global.__yochatMemoryState);
}

async function saveState(state: YochatState): Promise<void> {
  pruneState(state);
  if (redisConfigured()) {
    await redisCommand(["SET", STATE_KEY, JSON.stringify(state)]);
    return;
  }
  memoryGlobal().__yochatMemoryState = structuredClone(state);
}

function pruneState(state: YochatState): void {
  const retentionDays = Math.min(365, Math.max(7, state.settings?.retentionDays ?? 90));
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const staleContactIds = Object.values(state.contacts)
    .filter((contact) => {
      const hasOpenHandoff = Object.values(state.handoffs).some(
        (handoff) => handoff.contactId === contact.id && handoff.status !== "resolved",
      );
      return !hasOpenHandoff && new Date(contact.lastSeenAt).getTime() < cutoff;
    })
    .map((contact) => contact.id);
  const staleConversationIds = Object.values(state.conversations)
    .filter((conversation) => staleContactIds.includes(conversation.contactId))
    .map((conversation) => conversation.id);
  for (const id of staleContactIds) delete state.contacts[id];
  for (const id of staleConversationIds) delete state.conversations[id];
  for (const [id, enrollment] of Object.entries(state.enrollments)) {
    if (staleContactIds.includes(enrollment.contactId)) delete state.enrollments[id];
  }
  for (const [id, handoff] of Object.entries(state.handoffs)) {
    if (staleContactIds.includes(handoff.contactId)) delete state.handoffs[id];
  }
  for (const [id, job] of Object.entries(state.jobs)) {
    if (new Date(job.createdAt).getTime() < cutoff && job.status !== "pending" && job.status !== "processing") delete state.jobs[id];
  }
  state.messages = state.messages.filter(
    (message) => !staleConversationIds.includes(message.conversationId) && new Date(message.createdAt).getTime() >= cutoff,
  );
  state.analytics = state.analytics.filter((event) => new Date(event.createdAt).getTime() >= cutoff);
  state.audits = state.audits.filter((audit) => new Date(audit.createdAt).getTime() >= cutoff);
  state.campaignActivity = state.campaignActivity.filter(
    (activity) => new Date(activity.createdAt).getTime() >= cutoff,
  );
  state.messages = state.messages.slice(-5000);
  state.analytics = state.analytics.slice(-5000);
  state.campaignActivity = state.campaignActivity.slice(-5000);
  state.audits = state.audits.slice(-1500);
  const processed = Object.entries(state.processedEventIds)
    .filter(([, timestamp]) => new Date(timestamp).getTime() >= cutoff)
    .slice(-5000);
  state.processedEventIds = Object.fromEntries(processed);
}

async function acquireRedisLock(): Promise<string> {
  const token = randomUUID();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await redisCommand<string | null>(["SET", LOCK_KEY, token, "NX", "EX", 8]);
    if (result === "OK") return token;
    await new Promise((resolve) => setTimeout(resolve, 50 + attempt * 15));
  }
  throw new Error("Could not acquire Yochat state lock");
}

async function withMemoryLock<T>(callback: () => Promise<T>): Promise<T> {
  const global = memoryGlobal();
  const previous = global.__yochatMutationChain ?? Promise.resolve();
  let release: () => void = () => undefined;
  global.__yochatMutationChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

export async function mutateState<T>(mutator: (state: YochatState) => T | Promise<T>): Promise<T> {
  if (!redisConfigured()) {
    return withMemoryLock(async () => {
      const state = await loadState();
      const result = await mutator(state);
      await saveState(state);
      return result;
    });
  }

  const lockToken = await acquireRedisLock();
  try {
    const state = await loadState();
    const result = await mutator(state);
    await saveState(state);
    return result;
  } finally {
    await redisCommand([
      "EVAL",
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      LOCK_KEY,
      lockToken,
    ]).catch(() => undefined);
  }
}

export function storageMode(): "redis" | "memory" {
  return redisConfigured() ? "redis" : "memory";
}

export async function getBrandConfig(key: BrandKey): Promise<BrandConfig> {
  const state = await loadState();
  const base = getDefaultBrand(key);
  const override = state.brandOverrides[key];
  if (!override) return base;
  return {
    ...base,
    ...override,
    knowledge: override.knowledge ?? base.knowledge,
    rules: override.rules ?? base.rules,
    objectives: override.objectives ?? base.objectives,
  };
}

export async function getAllBrandConfigs(): Promise<BrandConfig[]> {
  return Promise.all(getDefaultBrands().map((brand) => getBrandConfig(brand.key)));
}

export async function getSystemSettings(): Promise<YochatState["settings"]> {
  return (await loadState()).settings;
}

export async function updateBrandConfig(key: BrandKey, update: Partial<BrandConfig>, actor = "admin"): Promise<BrandConfig> {
  return mutateState((state) => {
    state.brandOverrides[key] = { ...(state.brandOverrides[key] ?? {}), ...update, key };
    state.audits.push({ id: randomUUID(), action: "brand.updated", actor, target: key, createdAt: new Date().toISOString() });
    return { ...getDefaultBrand(key), ...state.brandOverrides[key] } as BrandConfig;
  });
}

export function addAnalytics(state: YochatState, event: Omit<AnalyticsEvent, "id" | "createdAt">): AnalyticsEvent {
  const record: AnalyticsEvent = { ...event, id: randomUUID(), createdAt: new Date().toISOString() };
  state.analytics.push(record);
  return record;
}

export function addAudit(state: YochatState, record: Omit<AuditRecord, "id" | "createdAt">): AuditRecord {
  const audit: AuditRecord = { ...record, id: randomUUID(), createdAt: new Date().toISOString() };
  state.audits.push(audit);
  return audit;
}

export async function deleteContactData(contactId: string, actor = "admin"): Promise<boolean> {
  return mutateState((state) => {
    const contact = state.contacts[contactId];
    if (!contact) return false;
    const conversationIds = Object.values(state.conversations)
      .filter((conversation) => conversation.contactId === contactId)
      .map((conversation) => conversation.id);
    delete state.contacts[contactId];
    for (const conversationId of conversationIds) delete state.conversations[conversationId];
    state.messages = state.messages.filter((message) => !conversationIds.includes(message.conversationId));
    for (const [id, handoff] of Object.entries(state.handoffs)) if (handoff.contactId === contactId) delete state.handoffs[id];
    for (const [id, enrollment] of Object.entries(state.enrollments)) if (enrollment.contactId === contactId) delete state.enrollments[id];
    addAudit(state, { action: "contact.deleted", actor, target: contactId });
    return true;
  });
}

export async function dashboardSnapshot() {
  const [state, brands] = await Promise.all([loadState(), getAllBrandConfigs()]);
  const totalsByBrand = brands.map((brand) => {
    const contacts = Object.values(state.contacts).filter((contact) => contact.brand === brand.key);
    const conversations = Object.values(state.conversations).filter((conversation) => conversation.brand === brand.key);
    const handoffs = Object.values(state.handoffs).filter((handoff) => handoff.brand === brand.key && handoff.status !== "resolved");
    return { brand: brand.key, contacts: contacts.length, conversations: conversations.length, openHandoffs: handoffs.length };
  });

  return {
    storageMode: storageMode(),
    settings: state.settings,
    operational: {
      failedJobs: Object.values(state.jobs).filter((job) => job.status === "failed").length,
      staleProcessingJobs: Object.values(state.jobs).filter(
        (job) => job.status === "processing" && Date.now() - new Date(job.lockedAt ?? job.createdAt).getTime() > 10 * 60_000,
      ).length,
      enabledBrands: brands.filter((brand) => brand.automationEnabled).length,
      configured: {
        meta: Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
        instagram: Boolean(process.env.META_INSTAGRAM_APP_SECRET && process.env.META_INSTAGRAM_ACCESS_TOKENS_JSON),
        ai: Boolean(process.env.NVIDIA_API_KEY),
        persistentStorage: redisConfigured(),
        scheduler: Boolean(process.env.QSTASH_TOKEN && process.env.CRON_SECRET),
      },
    },
    brands,
    totalsByBrand,
    contacts: Object.values(state.contacts).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 250),
    conversations: Object.values(state.conversations).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 250),
    messages: state.messages.slice(-500).reverse(),
    handoffs: Object.values(state.handoffs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    jobs: Object.values(state.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 250),
    sequences: Object.values(state.sequences),
    enrollments: Object.values(state.enrollments),
    analytics: state.analytics.slice(-1000).reverse(),
    audits: state.audits.slice(-250).reverse(),
    campaigns: Object.values(state.campaigns),
    campaignEnrollments: Object.values(state.campaignEnrollments),
    campaignActivity: state.campaignActivity.slice(-500).reverse(),
    mailingListSubscriptions: Object.values(state.mailingListSubscriptions),
  };
}

export async function resetTestData(): Promise<void> {
  await mutateState((state) => {
    const testContacts = Object.values(state.contacts).filter((contact) => contact.channel === "test").map((contact) => contact.id);
    const testConversations = Object.values(state.conversations)
      .filter((conversation) => conversation.channel === "test")
      .map((conversation) => conversation.id);
    for (const id of testContacts) delete state.contacts[id];
    for (const id of testConversations) delete state.conversations[id];
    state.messages = state.messages.filter((message) => !testConversations.includes(message.conversationId));
    for (const [id, handoff] of Object.entries(state.handoffs)) if (testContacts.includes(handoff.contactId)) delete state.handoffs[id];
    for (const [id, enrollment] of Object.entries(state.enrollments)) if (testContacts.includes(enrollment.contactId)) delete state.enrollments[id];
    for (const [id, enrollment] of Object.entries(state.campaignEnrollments)) {
      if (testContacts.includes(enrollment.contactId)) delete state.campaignEnrollments[id];
    }
    for (const [id, subscription] of Object.entries(state.mailingListSubscriptions)) {
      if (testContacts.includes(subscription.contactId)) delete state.mailingListSubscriptions[id];
    }
    state.campaignActivity = state.campaignActivity.filter((activity) => !testContacts.includes(activity.contactId));
    state.analytics = state.analytics.filter((event) => event.channel !== "test");
    addAudit(state, { action: "test.reset", actor: "admin" });
  });
}
