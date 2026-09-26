import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getDefaultBrand } from "@/lib/brands";
import { dryRunFlow } from "@/lib/flow-runner";
import { getHttpValidationContext } from "@/lib/http";
import {
  archiveFlow,
  createDraftFromPublished,
  createFlow,
  deleteFlow,
  duplicateFlow,
  getFlow,
  listFlows,
  publishFlow,
  rollbackFlow,
  unpublishFlow,
  updateFlow,
  validateFlowDefinition,
} from "@/lib/flows";
import type { BrandKey, FlowNode, IncomingEvent, TriggerType } from "@/lib/types";
import { verifyCsrfToken } from "@/lib/csrf";

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);
const allowedTriggers = new Set<TriggerType>([
  "message",
  "comment",
  "story_reply",
  "mention",
  "postback",
  "referral",
  "follow",
  "test",
]);

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const flowId = url.searchParams.get("flowId");
  if (flowId) {
    const flow = await getFlow(flowId);
    if (!flow) return badRequest(`flow ${flowId} not found`);
    return NextResponse.json({ flow });
  }
  const brandParam = url.searchParams.get("brand");
  const brand = brandParam && allowedBrands.has(brandParam as BrandKey) ? (brandParam as BrandKey) : undefined;
  return NextResponse.json({ flows: await listFlows(brand) });
}

type ActionBody = {
  action?:
    | "create"
    | "update"
    | "create_draft"
    | "validate"
    | "publish"
    | "unpublish"
    | "archive"
    | "rollback"
    | "duplicate"
    | "dry_run"
    | "delete";
  flowId?: string;
  brand?: BrandKey;
  name?: string;
  description?: string;
  nodes?: Record<string, FlowNode>;
  entryNodeId?: string;
  version?: number;
  text?: string;
  trigger?: TriggerType;
  contactName?: string;
  /**
   * Wave 8: publish requires the operator's explicit confirmation. The
   * admin UI sends `confirm: "PUBLISH"` only after the typed-PUBLISH
   * modal; programmatic callers must include it too.
   */
  confirm?: string;
};

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Wave 9 (item 5): CSRF synchronizer token required on admin mutations.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as ActionBody;

  try {
    switch (body.action) {
      case "create": {
        if (!body.brand || !allowedBrands.has(body.brand)) return badRequest("a valid brand is required");
        const flow = await createFlow({
          brand: body.brand,
          name: body.name ?? "",
          description: body.description,
          nodes: body.nodes ?? {},
          entryNodeId: body.entryNodeId ?? "",
        });
        return NextResponse.json({ ok: true, flow });
      }
      case "update": {
        if (!body.flowId) return badRequest("flowId is required");
        const flow = await updateFlow(body.flowId, {
          name: body.name,
          description: body.description,
          nodes: body.nodes,
          entryNodeId: body.entryNodeId,
        });
        return NextResponse.json({ ok: true, flow });
      }
      case "create_draft": {
        if (!body.flowId) return badRequest("flowId is required");
        const flow = await createDraftFromPublished(body.flowId);
        return NextResponse.json({ ok: true, flow });
      }
      case "validate": {
        if (!body.flowId) return badRequest("flowId is required");
        const flow = await getFlow(body.flowId);
        if (!flow) return badRequest(`flow ${body.flowId} not found`);
        // Wave 7: same allowlist + secret context publish uses, so the admin
        // sees the publish gate before attempting it.
        const http = await getHttpValidationContext(flow.brand);
        return NextResponse.json({ ok: true, ...validateFlowDefinition(flow.nodes, flow.entryNodeId, { http }) });
      }
      case "publish": {
        if (!body.flowId) return badRequest("flowId is required");
        // Wave 8: publish is irreversible UI surface; require the typed
        // confirmation token the modal collects from the operator.
        if (body.confirm !== "PUBLISH") {
          return badRequest('publish confirmation required: send confirm "PUBLISH" after the operator types it');
        }
        const flow = await publishFlow(body.flowId);
        return NextResponse.json({ ok: true, flow });
      }
      case "unpublish": {
        if (!body.flowId) return badRequest("flowId is required");
        const flow = await unpublishFlow(body.flowId);
        return NextResponse.json({ ok: true, flow });
      }
      case "archive": {
        if (!body.flowId) return badRequest("flowId is required");
        const flow = await archiveFlow(body.flowId);
        return NextResponse.json({ ok: true, flow });
      }
      case "rollback": {
        if (!body.flowId) return badRequest("flowId is required");
        if (typeof body.version !== "number") return badRequest("version is required");
        const flow = await rollbackFlow(body.flowId, body.version);
        return NextResponse.json({ ok: true, flow });
      }
      case "duplicate": {
        if (!body.flowId) return badRequest("flowId is required");
        const flow = await duplicateFlow(body.flowId);
        return NextResponse.json({ ok: true, flow });
      }
      case "dry_run": {
        if (!body.flowId) return badRequest("flowId is required");
        if (!body.text?.trim()) return badRequest("text is required for a dry run");
        const flow = await getFlow(body.flowId);
        if (!flow) return badRequest(`flow ${body.flowId} not found`);
        const trigger = body.trigger && allowedTriggers.has(body.trigger) ? body.trigger : "message";
        const result = await dryRunFlow(flow, {
          text: body.text.trim(),
          trigger,
          brand: getDefaultBrand(flow.brand),
          contactName: body.contactName,
        });
        return NextResponse.json({
          ok: true,
          flowId: flow.id,
          version: flow.version,
          status: flow.status,
          completed: result.completed,
          stopReason: result.stopReason,
          reply: result.reply,
          actions: result.actions,
          trace: result.trace,
        });
      }
      case "delete": {
        if (!body.flowId) return badRequest("flowId is required");
        await deleteFlow(body.flowId);
        return NextResponse.json({ ok: true });
      }
      default:
        return badRequest(
          "action is required (create|update|create_draft|validate|publish|unpublish|archive|rollback|duplicate|dry_run|delete)",
        );
    }
  } catch (error) {
    // Lifecycle/business-rule violations are 400s; unexpected failures are 500s.
    const message = error instanceof Error ? error.message : "Unknown flow error";
    const isBusinessError = /not found|required|immutable|already published|not published|failed validation|no published version|unpublish or archive/i.test(
      message,
    );
    return NextResponse.json({ error: message }, { status: isBusinessError ? 400 : 500 });
  }
}
