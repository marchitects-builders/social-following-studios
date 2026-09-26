import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getFlowRun, listFlowRuns, listFlowRunsForContact } from "@/lib/flowruns";

/**
 * Wave 2 (advisor round 2) — flow execution records ("causality").
 * Answers "why did this person receive this message?" by exposing the
 * pinned-version trace of every live flow run.
 *
 * GET params (mutually exclusive):
 * - runId: one execution record
 * - contactId: recent runs for a contact (newest first)
 * - flowId: recent runs of a flow definition
 * - (none): recent runs across all flows
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const contactId = url.searchParams.get("contactId");
  const flowId = url.searchParams.get("flowId");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));

  if (runId) {
    const run = await getFlowRun(runId);
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ run });
  }
  if (contactId) {
    return NextResponse.json({ runs: await listFlowRunsForContact(contactId, limit) });
  }
  const runs = await listFlowRuns(limit);
  return NextResponse.json({ runs: flowId ? runs.filter((run) => run.flowId === flowId) : runs });
}
