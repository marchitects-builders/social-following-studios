import { randomUUID } from "node:crypto";
import { seedKnowledgeDocs } from "@/lib/ai-knowledge";
import { getDefaultBrand, getDefaultBrands } from "@/lib/brands";
import { mirrorKeyedState } from "@/lib/store-keys";
import {
  keyedGetContactRaw,
  keyedGetTranscriptRaw,
  keyedSetContactRaw,
  keyedSyncTranscriptRaw,
} from "@/lib/store-keys";
import { redisCommand, redisCircuitOpen, redisConfigured, redisCredentialsConfigured, stateRedisCredentials } from "@/lib/redis";
import type {
  AiKnowledgeDoc,
  AnalyticsEvent,
  AuditRecord,
  BrandConfig,
  BrandKey,
  CampaignDefinition,
  Contact,
  MessageRecord,
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
    brandSecrets: {},
    processedEventIds: {},
    flows: {},
    knowledgeDocs: {},
    ai: { dailyTokenBudgets: {}, writeLevels: {} },
    settings: {
      globalAutomationPaused: false,
      retentionDays: 90,
    },
    security: {
      adminPasswordHash: null,
      passwordChangedAt: null,
    },
  };
}

type MemoryGlobal = typeof globalThis & {
  __yochatMemoryState?: YochatState;
  __yochatMutationChain?: Promise<void>;
  /**
   * War-room (g): set when state was persisted to memory while Redis
   * credentials exist (i.e. the circuit was open). Those outage-era writes
   * must be reconciled back into Redis on recovery — see
   * reconcileDegradedWrites().
   */
  __yochatDegradedWrite?: boolean;
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}

function redisCredentials(): { url?: string; token?: string } {
  // Wave 9 (item 8): the state blob uses the STATE credential scope.
  return stateRedisCredentials();
}

function redisIsConfigured(): boolean {
  return redisConfigured("state");
}

async function redisStateCommand<T>(command: Array<string | number>): Promise<T> {
  return redisCommand<T>(command, "state");
}

function normalizeState(value: Partial<YochatState> | null): YochatState {
  const base = emptyState();
  if (!value) return base;
  const contacts = value.contacts ?? {};
  // Wave 3 migration: contacts created before notes existed get an empty list.
  for (const contact of Object.values(contacts)) {
    if (!Array.isArray((contact as { notes?: unknown }).notes)) {
      (contact as { notes: unknown[] }).notes = [];
    }
  }
  const knowledgeDocs: Record<string, AiKnowledgeDoc> = { ...(value.knowledgeDocs ?? {}) };
  // Wave 5 migration: seed versioned knowledge docs once per brand from the
  // effective brand knowledge (operator override ?? defaults). Idempotent.
  const now = new Date().toISOString();
  for (const brand of getDefaultBrands()) {
    const hasDocs = Object.values(knowledgeDocs).some((doc) => doc.brand === brand.key);
    if (!hasDocs) {
      const effective = (value.brandOverrides?.[brand.key]?.knowledge ?? brand.knowledge) as BrandConfig["knowledge"];
      seedKnowledgeDocs(knowledgeDocs, brand.key, effective, now);
    }
  }
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
    brandSecrets: value.brandSecrets ?? {},
    processedEventIds: value.processedEventIds ?? {},
    flows: value.flows ?? {},
    knowledgeDocs,
    ai: {
      dailyTokenBudgets: value.ai?.dailyTokenBudgets ?? {},
      writeLevels: value.ai?.writeLevels ?? {},
    },
    settings: {
      ...base.settings,
      ...(value.settings ?? {}),
    },
    security: {
      adminPasswordHash: value.security?.adminPasswordHash ?? null,
      passwordChangedAt: value.security?.passwordChangedAt ?? null,
    },
  };
}

export async function loadState(): Promise<YochatState> {
  if (redisIsConfigured()) {
    try {
      const encoded = await redisCommand<string | null>(["GET", STATE_KEY]);
      const state = normalizeState(encoded ? (JSON.parse(encoded) as Partial<YochatState>) : null);
      // War-room (g): fold any outage-era degraded writes back in (additive).
      return reconcileDegradedWrites(state);
    } catch (error) {
      // War-room (g): Redis failed on the read (the circuit is now open).
      // Degrade to memory instead of 500ing — the write is journaled for
      // reconciliation. Non-Redis errors (corrupt JSON, app bugs) stay loud.
      if (!isRedisError(error) || !redisCircuitOpen()) throw error;
      return degradedMemoryState();
    }
  }

  const global = memoryGlobal();
  global.__yochatMemoryState ??= emptyState();
  // Normalize on every memory-mode load too: runs the Wave 3/5 migrations
  // (contact notes, knowledge-doc seeding) idempotently.
  global.__yochatMemoryState = normalizeState(global.__yochatMemoryState);
  return structuredClone(global.__yochatMemoryState);
}

/**
 * War-room (g): in-memory state used when Redis is unreachable. Journals the
 * degraded write so post-recovery reconciliation can merge it back.
 */
function degradedMemoryState(): YochatState {
  const global = memoryGlobal();
  global.__yochatMemoryState ??= emptyState();
  global.__yochatMemoryState = normalizeState(global.__yochatMemoryState);
  if (redisCredentialsConfigured("state")) {
    global.__yochatDegradedWrite = true;
  }
  return structuredClone(global.__yochatMemoryState);
}

/** Latest-write timestamp for conflict resolution during outage reconciliation. */
function recordTimestamp(record: unknown): number {
  const fields = record as Record<string, unknown>;
  for (const key of ["updatedAt", "lastSeenAt", "lockedAt", "createdAt"]) {
    const value = fields[key];
    if (typeof value === "string") {
      const time = new Date(value).getTime();
      if (Number.isFinite(time)) return time;
    }
  }
  return 0;
}

/**
 * War-room (g): additive merge of outage-era memory writes into the
 * recovered Redis state. New IDs union freely; on key conflicts the newer
 * record wins (tie → the degraded/outage copy, since Redis could not have
 * been written while the circuit was open). Append-only logs concatenate.
 * Singleton config (settings, security, ai) is NOT merged — the Redis
 * version wins and the limitation is logged.
 *
 * Single-process scope: only reconciles THIS process's degraded writes.
 */
function mergeOutageState(redisState: YochatState, memoryState: YochatState): YochatState {
  const merged: YochatState = { ...redisState };
  const dictCollections = [
    "contacts",
    "conversations",
    "handoffs",
    "jobs",
    "sequences",
    "enrollments",
    "campaigns",
    "campaignEnrollments",
    "mailingListSubscriptions",
    "brandOverrides",
    "brandSecrets",
    "flows",
    "knowledgeDocs",
  ] as const;
  let mergedRecords = 0;
  for (const name of dictCollections) {
    const fromRedis = redisState[name] as Record<string, unknown>;
    const fromMemory = memoryState[name] as Record<string, unknown>;
    const out: Record<string, unknown> = { ...fromRedis };
    for (const [id, memRecord] of Object.entries(fromMemory)) {
      const redisRecord = fromRedis[id];
      if (redisRecord === undefined) {
        out[id] = memRecord;
        mergedRecords += 1;
      } else if (recordTimestamp(memRecord) >= recordTimestamp(redisRecord)) {
        out[id] = memRecord;
        mergedRecords += 1;
      }
    }
    (merged as unknown as Record<string, unknown>)[name] = out;
  }
  // Messages: union by id (append-only).
  const messageIds = new Set(redisState.messages.map((m) => m.id));
  const newMessages = memoryState.messages.filter((m) => !messageIds.has(m.id));
  merged.messages = [...redisState.messages, ...newMessages];
  mergedRecords += newMessages.length;
  // Append-only logs: concatenate, de-duplicating exact entries.
  const concatUnique = <T,>(a: T[], b: T[]): T[] => {
    const seen = new Set(a.map((item) => JSON.stringify(item)));
    const out = [...a];
    for (const item of b) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };
  merged.analytics = concatUnique(redisState.analytics, memoryState.analytics);
  merged.audits = concatUnique(redisState.audits, memoryState.audits);
  merged.campaignActivity = concatUnique(redisState.campaignActivity, memoryState.campaignActivity);
  // Processed-event index: union, keeping the latest timestamp per event.
  const processed: Record<string, string> = { ...redisState.processedEventIds };
  for (const [id, ts] of Object.entries(memoryState.processedEventIds)) {
    if (!processed[id] || new Date(ts).getTime() > new Date(processed[id]).getTime()) processed[id] = ts;
  }
  merged.processedEventIds = processed;
  // Singleton config (settings, security, ai): Redis wins by policy.
  merged.settings = redisState.settings;
  merged.security = redisState.security;
  merged.ai = redisState.ai;
  return merged;
}

async function reconcileDegradedWrites(redisState: YochatState): Promise<YochatState> {
  const global = memoryGlobal();
  if (!global.__yochatDegradedWrite) return redisState;
  const memoryState = global.__yochatMemoryState;
  global.__yochatDegradedWrite = false;
  if (!memoryState) return redisState;
  const merged = mergeOutageState(redisState, memoryState);
  await redisStateCommand(["SET", STATE_KEY, JSON.stringify(merged)]);
  const { logOps } = await import("@/lib/ops");
  await logOps("info", "redis", "Reconciled degraded-mode writes back to Redis after outage", {
    note: "additive merge; conflicts resolved last-write-wins; singleton config kept from Redis",
  }).catch(() => undefined);
  return merged;
}

async function saveState(state: YochatState): Promise<void> {
  pruneState(state);
  if (redisIsConfigured()) {
    await redisStateCommand(["SET", STATE_KEY, JSON.stringify(state)]);
  } else {
    memoryGlobal().__yochatMemoryState = structuredClone(state);
    // War-room (g): credentials exist but we wrote to memory → the circuit
    // is open; journal this so recovery reconciles the outage-era writes.
    if (redisCredentialsConfigured("state")) {
      memoryGlobal().__yochatDegradedWrite = true;
    }
  }
  // Wave 9 (item 1) — migration write-through: mirror contacts and
  // transcripts into the keyed structures on every blob save. The blob is
  // still the source of truth; the mirror must never fail the primary write.
  try {
    await mirrorKeyedState(state);
  } catch (error) {
    const { logOps } = await import("@/lib/ops");
    await logOps("warning", "migration", "keyed mirror write-through failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => undefined);
  }
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
  if (!redisIsConfigured()) {
    return withMemoryLock(async () => {
      const state = await loadState();
      const result = await mutator(state);
      await saveState(state);
      return result;
    });
  }

  // War-room (g): the Redis path degrades to memory on Redis failure
  // (circuit now open) instead of 500ing the request. Only Redis errors
  // degrade — a mutator (app-logic) error must never re-run the mutator.
  // Non-circuit errors stay loud.
  try {
    const lockToken = await acquireRedisLock();
    try {
      const state = await loadState();
      const result = await mutator(state);
      await saveState(state);
      return result;
    } finally {
      await redisStateCommand([
        "EVAL",
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        LOCK_KEY,
        lockToken,
      ]).catch(() => undefined);
    }
  } catch (error) {
    if (!isRedisError(error) || !redisCircuitOpen()) throw error;
    return withMemoryLock(async () => {
      const state = await degradedMemoryState();
      const result = await mutator(state);
      await saveState(state);
      return result;
    });
  }
}

/** True for errors raised by the Redis transport (not app-logic errors). */
function isRedisError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Redis|fetch failed|circuit is open|UND_ERR|ECONNREFUSED|ETIMEDOUT/i.test(message);
}

export function storageMode(): "redis" | "memory" {
  return redisIsConfigured() ? "redis" : "memory";
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
  // Wave 6: brand health at a glance — 24h analytics rollup per brand.
  // Lazy import: lib/analytics reads state from this module; a static
  // import would create a module cycle.
  const { getBrandAnalytics } = await import("@/lib/analytics");
  const brandHealth = await Promise.all(
    brands.map(async (brand) => {
      const analytics = await getBrandAnalytics(brand.key, "24h");
      return {
        brand: brand.key,
        conversations24h: analytics.conversations.inbound,
        messagesIn24h: analytics.messages.inbound,
        messagesOut24h: analytics.messages.outbound,
        aiReplies24h: analytics.messages.aiReplies,
        aiCostUsd24h: analytics.ai.costUsd,
        costPerConversationUsd: analytics.costPerConversationUsd,
        costPerLeadUsd: analytics.costPerLeadUsd,
        flowCompletionRate24h: analytics.flows.completionRate,
        openHandoffs: analytics.handoffs.open,
        deliveryFailures24h: analytics.deliveryFailures.total,
        optOuts24h: analytics.optOuts,
        leadsCaptured24h: analytics.leads.captured,
      };
    }),
  );
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
        persistentStorage: redisIsConfigured(),
        scheduler: Boolean(process.env.QSTASH_TOKEN && process.env.CRON_SECRET),
      },
    },
    brands,
    totalsByBrand,
    brandHealth,
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
    flows: Object.values(state.flows).map((flow) => ({
      id: flow.id,
      brand: flow.brand,
      name: flow.name,
      status: flow.status,
      version: flow.version,
      nodeCount: Object.keys(flow.nodes).length,
      updatedAt: flow.updatedAt,
      publishedAt: flow.publishedAt,
    })),
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
    // Wave 6: sweep test-fixture delivery jobs (simulate_stuck_job /
    // simulate_failed_job mark their synthesized jobs with metadata.probe).
    for (const [id, job] of Object.entries(state.jobs)) {
      if (job.metadata?.probe === true) delete state.jobs[id];
    }
    // Wave 7: sweep integration probe data (secrets + allowlist overrides).
    state.brandSecrets = {};
    for (const key of Object.keys(state.brandOverrides)) {
      const override = state.brandOverrides[key as keyof typeof state.brandOverrides];
      if (override && "httpAllowlist" in override) delete override.httpAllowlist;
    }
    addAudit(state, { action: "test.reset", actor: "admin" });
  });
}

/**
 * Wave 9 (item 1) — dual-read / dual-write keyed accessors for the blob
 * extraction migration.
 *
 * - Reads (getKeyedContact, getKeyedTranscript): new keyed structures first,
 *   fall back to the blob with lazy backfill when a key is missing.
 * - Writes (writeContactKeyed, appendTranscriptMessageKeyed): write the new
 *   keyed structures AND the legacy blob (write-through during transition),
 *   so data written via the new path is readable via the old path and vice
 *   versa (the blob save mirrors everything back into the keyed store).
 */

export async function getKeyedContact(brand: BrandKey, contactId: string): Promise<Contact | undefined> {
  const keyed = await keyedGetContactRaw(brand, contactId);
  if (keyed) return keyed;
  // Dual-read fallback: the blob is still the source of truth. Backfill the
  // keyed copy so the next read hits the new structure.
  const state = await loadState();
  const contact = state.contacts[contactId];
  if (!contact || contact.brand !== brand) return undefined;
  await keyedSetContactRaw(contact);
  return contact;
}

export async function getKeyedTranscript(
  brand: BrandKey,
  contactId: string,
  limit = 500,
): Promise<MessageRecord[]> {
  const keyed = await keyedGetTranscriptRaw(brand, contactId, limit);
  if (keyed.length > 0) return keyed;
  // Dual-read fallback: rebuild the contact's transcript from the blob's
  // conversations + messages, backfill, and return it.
  const state = await loadState();
  const conversationIds = new Set(
    Object.values(state.conversations)
      .filter((conversation) => conversation.contactId === contactId && conversation.brand === brand)
      .map((conversation) => conversation.id),
  );
  const messages = state.messages
    .filter((message) => conversationIds.has(message.conversationId))
    .sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
    );
  if (messages.length > 0) await keyedSyncTranscriptRaw(brand, contactId, messages);
  return messages.slice(-Math.min(2000, Math.max(1, limit)));
}

export async function writeContactKeyed(contact: Contact): Promise<void> {
  await keyedSetContactRaw(contact);
  await mutateState((state) => {
    state.contacts[contact.id] = contact;
  });
}

export async function appendTranscriptMessageKeyed(
  brand: BrandKey,
  contactId: string,
  message: MessageRecord,
): Promise<void> {
  const existing = await keyedGetTranscriptRaw(brand, contactId, 2000);
  await keyedSyncTranscriptRaw(brand, contactId, [...existing, message]);
  await mutateState((state) => {
    if (!state.messages.some((existingMessage) => existingMessage.id === message.id)) {
      state.messages.push(message);
    }
  });
}

export type KeyedProbeStep = { name: string; ok: boolean; detail?: string };

/**
 * Migration fixture proof (run by the admin ops keyed_probe action and the
 * Wave 9 smoke checks): writes via the NEW path and reads via the OLD path,
 * then writes via the OLD path and reads via the NEW path — for both
 * contacts and transcripts. Cleans up after itself.
 */
export async function keyedProbeRoundTrip(): Promise<{ ok: boolean; steps: KeyedProbeStep[] }> {
  const steps: KeyedProbeStep[] = [];
  const contactId = `w9-migration-probe:${randomUUID()}`;
  const conversationId = `w9-migration-conv:${randomUUID()}`;
  const messageId = `w9-migration-msg:${randomUUID()}`;
  const now = new Date().toISOString();

  const probeContact: Contact = {
    id: contactId,
    brand: "aafc",
    channel: "test",
    externalId: "w9-migration-external",
    tags: [],
    fields: {},
    leadStage: "new",
    optedOut: false,
    automationPaused: false,
    notes: [],
    firstSeenAt: now,
    lastSeenAt: now,
    source: "wave9-migration-probe",
  };
  const probeMessage: MessageRecord = {
    id: messageId,
    conversationId,
    direction: "inbound",
    text: "Wave 9 migration probe message",
    trigger: "test",
    status: "received",
    createdAt: now,
  };

  try {
    // 1. Write contact via the NEW keyed path → read via the OLD blob path.
    await writeContactKeyed(probeContact);
    const oldPathContact = (await loadState()).contacts[contactId];
    steps.push({
      name: "contact: write-new → read-old",
      ok: oldPathContact?.id === contactId && oldPathContact.source === "wave9-migration-probe",
      detail: oldPathContact ? "visible in blob" : "missing from blob",
    });

    // 2. Write contact via the OLD blob path → read via the NEW keyed path.
    const blobOnlyId = `w9-migration-blob:${randomUUID()}`;
    await mutateState((state) => {
      state.contacts[blobOnlyId] = { ...probeContact, id: blobOnlyId, externalId: "w9-blob-only" };
    });
    const newPathContact = await getKeyedContact("aafc", blobOnlyId);
    steps.push({
      name: "contact: write-old → read-new",
      ok: newPathContact?.id === blobOnlyId,
      detail: newPathContact ? "visible via keyed read" : "missing via keyed read",
    });

    // 3. Transcript: write via the NEW keyed path → read via the OLD blob path.
    await mutateState((state) => {
      state.conversations[conversationId] = {
        id: conversationId,
        brand: "aafc",
        channel: "test",
        accountId: "test",
        contactId,
        status: "open",
        lastIntent: "unknown",
        summary: "",
        createdAt: now,
        updatedAt: now,
      };
    });
    await appendTranscriptMessageKeyed("aafc", contactId, probeMessage);
    const oldPathMessage = (await loadState()).messages.find((message) => message.id === messageId);
    steps.push({
      name: "transcript: write-new → read-old",
      ok: oldPathMessage?.text === "Wave 9 migration probe message",
      detail: oldPathMessage ? "visible in blob messages" : "missing from blob messages",
    });

    // 4. Transcript: write via the OLD blob path → read via the NEW keyed path.
    const blobOnlyMessageId = `w9-migration-blobmsg:${randomUUID()}`;
    await mutateState((state) => {
      state.messages.push({ ...probeMessage, id: blobOnlyMessageId, text: "Wave 9 blob-only probe message" });
    });
    const newPathTranscript = await getKeyedTranscript("aafc", contactId, 500);
    steps.push({
      name: "transcript: write-old → read-new",
      ok: newPathTranscript.some((message) => message.id === blobOnlyMessageId),
      detail: `keyed transcript holds ${newPathTranscript.length} message(s)`,
    });
  } finally {
    // Cleanup: nothing probe-related stays live (mirror drops the keyed copies).
    await mutateState((state) => {
      for (const id of Object.keys(state.contacts)) {
        if (id.includes("w9-migration")) delete state.contacts[id];
      }
      delete state.conversations[conversationId];
      state.messages = state.messages.filter((message) => !message.id.includes("w9-migration"));
    });
  }

  const postCleanup = await keyedGetContactRaw("aafc", contactId);
  steps.push({
    name: "cleanup: keyed copies dropped with the blob",
    ok: postCleanup === undefined,
    detail: postCleanup ? "keyed contact still present" : "keyed contact gone",
  });
  return { ok: steps.every((step) => step.ok), steps };
}
