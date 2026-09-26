import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  getKnowledgeDoc,
  listKnowledgeDocs,
  updateKnowledgeDoc,
  verifyKnowledgeDoc,
} from "@/lib/ai-knowledge";
import type { BrandKey } from "@/lib/types";
import { verifyCsrfToken } from "@/lib/csrf";

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);

/**
 * Wave 5 — structured knowledge object CRUD (admin only).
 * Actions: list, get, create, update, delete, verify.
 * Edits bump the version; verify sets the "last verified" marker.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Wave 9 (item 5): CSRF synchronizer token required on admin mutations.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    brand?: string;
    id?: string;
    title?: string;
    content?: string;
    enabled?: boolean;
  };

  try {
    switch (body.action) {
      case "list": {
        if (body.brand && !allowedBrands.has(body.brand as BrandKey)) {
          return NextResponse.json({ error: "unknown brand" }, { status: 400 });
        }
        return NextResponse.json({ docs: await listKnowledgeDocs(body.brand as BrandKey | undefined) });
      }
      case "get": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const doc = await getKnowledgeDoc(body.id);
        if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
        return NextResponse.json({ doc });
      }
      case "create": {
        if (!body.brand || !allowedBrands.has(body.brand as BrandKey)) {
          return NextResponse.json({ error: "brand is required" }, { status: 400 });
        }
        const doc = await createKnowledgeDoc(body.brand as BrandKey, {
          title: body.title ?? "",
          content: body.content ?? "",
          enabled: body.enabled,
        });
        return NextResponse.json({ doc });
      }
      case "update": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const doc = await updateKnowledgeDoc(body.id, {
          title: body.title,
          content: body.content,
          enabled: body.enabled,
        });
        return NextResponse.json({ doc });
      }
      case "delete": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        return NextResponse.json({ deleted: await deleteKnowledgeDoc(body.id) });
      }
      case "verify": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        return NextResponse.json({ doc: await verifyKnowledgeDoc(body.id) });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge action failed" },
      { status: 400 },
    );
  }
}
