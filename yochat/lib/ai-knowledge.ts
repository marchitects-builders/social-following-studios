import { randomUUID } from "node:crypto";
import { addAudit, loadState, mutateState } from "@/lib/store";
import type { AiKnowledgeDoc, BrandConfig, BrandKey } from "@/lib/types";

/**
 * Wave 5 — structured knowledge objects.
 *
 * NO RAG, NO embeddings, NO vector DB (both Round-4 advisors agree: not
 * until ~15,000 knowledge tokens). Per-brand documents are stored as
 * versioned objects in the state blob: {id, title, content, updatedAt,
 * version}, with a "last verified" marker the operator sets after
 * confirming the content is still accurate.
 *
 * The AI prompt-stuffing path (buildKnowledgeBlock) draws ONLY from
 * these objects, truncation-aware and token-budget-aware (~4 chars /
 * token). Every object used is cited as "kb:<id>-v<version>" so the
 * system prompt can enforce grounding discipline.
 */

export const AI_KNOWLEDGE_TOKEN_BUDGET = 2500;
const AI_KNOWLEDGE_CHAR_BUDGET = AI_KNOWLEDGE_TOKEN_BUDGET * 4;

export function knowledgeDocId(brand: BrandKey, slug: string): string {
  return `${brand}:${slug}`;
}

/** Grounding citation rendered into prompts and message metadata. */
export function citationId(doc: AiKnowledgeDoc): string {
  return `kb:${doc.id}-v${doc.version}`;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `doc-${randomUUID().slice(0, 8)}`
  );
}

/**
 * Seed-once migration: every entry in the effective brand knowledge
 * (brand override ?? defaults) becomes a version-1 doc. Idempotent —
 * existing docs are never overwritten.
 */
export function seedKnowledgeDocs(
  docs: Record<string, AiKnowledgeDoc>,
  brand: BrandKey,
  knowledge: BrandConfig["knowledge"],
  now: string,
): void {
  for (const entry of knowledge) {
    const id = knowledgeDocId(brand, entry.id);
    if (docs[id]) continue;
    docs[id] = {
      id,
      brand,
      title: entry.title,
      content: entry.content,
      enabled: entry.enabled,
      version: 1,
      updatedAt: now,
    };
  }
}

export async function listKnowledgeDocs(brand?: BrandKey): Promise<AiKnowledgeDoc[]> {
  const state = await loadState();
  return Object.values(state.knowledgeDocs)
    .filter((doc) => !brand || doc.brand === brand)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getKnowledgeDoc(id: string): Promise<AiKnowledgeDoc | undefined> {
  return (await loadState()).knowledgeDocs[id];
}

export async function createKnowledgeDoc(
  brand: BrandKey,
  input: { title: string; content: string; enabled?: boolean },
  actor = "admin",
): Promise<AiKnowledgeDoc> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw new Error("title and content are required");
  return mutateState((state) => {
    const id = knowledgeDocId(brand, slugify(title));
    if (state.knowledgeDocs[id]) throw new Error(`knowledge doc ${id} already exists`);
    const doc: AiKnowledgeDoc = {
      id,
      brand,
      title,
      content,
      enabled: input.enabled ?? true,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    state.knowledgeDocs[id] = doc;
    addAudit(state, { action: "ai.knowledge.created", actor, target: id, detail: { brand, version: 1 } });
    return structuredClone(doc);
  });
}

export async function updateKnowledgeDoc(
  id: string,
  input: { title?: string; content?: string; enabled?: boolean },
  actor = "admin",
): Promise<AiKnowledgeDoc> {
  return mutateState((state) => {
    const doc = state.knowledgeDocs[id];
    if (!doc) throw new Error(`knowledge doc ${id} not found`);
    const title = input.title?.trim();
    const content = input.content?.trim();
    if (title !== undefined && !title) throw new Error("title cannot be empty");
    if (content !== undefined && !content) throw new Error("content cannot be empty");
    const changed =
      (title !== undefined && title !== doc.title) ||
      (content !== undefined && content !== doc.content) ||
      (input.enabled !== undefined && input.enabled !== doc.enabled);
    if (title !== undefined) doc.title = title;
    if (content !== undefined) doc.content = content;
    if (input.enabled !== undefined) doc.enabled = input.enabled;
    if (changed) {
      doc.version += 1;
      doc.updatedAt = new Date().toISOString();
      // An edit invalidates the previous verification.
      doc.lastVerifiedAt = undefined;
    }
    addAudit(state, {
      action: "ai.knowledge.updated",
      actor,
      target: id,
      detail: { version: doc.version, changed },
    });
    return structuredClone(doc);
  });
}

export async function deleteKnowledgeDoc(id: string, actor = "admin"): Promise<boolean> {
  return mutateState((state) => {
    if (!state.knowledgeDocs[id]) return false;
    delete state.knowledgeDocs[id];
    addAudit(state, { action: "ai.knowledge.deleted", actor, target: id });
    return true;
  });
}

/** Operator confirms the content is still accurate; does NOT bump version. */
export async function verifyKnowledgeDoc(id: string, actor = "admin"): Promise<AiKnowledgeDoc> {
  return mutateState((state) => {
    const doc = state.knowledgeDocs[id];
    if (!doc) throw new Error(`knowledge doc ${id} not found`);
    doc.lastVerifiedAt = new Date().toISOString();
    addAudit(state, { action: "ai.knowledge.verified", actor, target: id, detail: { version: doc.version } });
    return structuredClone(doc);
  });
}

export type KnowledgeBlock = {
  /** prompt-ready text, newest docs first, truncated to the token budget */
  block: string;
  /** citation ids actually stuffed, in order */
  cited: string[];
  truncated: boolean;
};

/**
 * Builds the verified-knowledge block for the AI system prompt.
 * Truncation-aware: docs are added newest-first until the char budget
 * (token budget × 4) is hit; `truncated` reports whether docs were cut.
 */
export async function buildKnowledgeBlock(brand: BrandKey): Promise<KnowledgeBlock> {
  const docs = (await listKnowledgeDocs(brand))
    .filter((doc) => doc.enabled)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lines: string[] = [];
  const cited: string[] = [];
  let chars = 0;
  let truncated = false;
  for (const doc of docs) {
    const line = `[${citationId(doc)}] ${doc.title}: ${doc.content}`;
    if (chars + line.length > AI_KNOWLEDGE_CHAR_BUDGET) {
      truncated = true;
      break;
    }
    lines.push(line);
    cited.push(citationId(doc));
    chars += line.length + 1;
  }
  return { block: lines.join("\n"), cited, truncated };
}
