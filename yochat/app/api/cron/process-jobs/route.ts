import { NextResponse } from "next/server";
import { processDueJobs } from "@/lib/jobs";
import { processDueHandoffResumes } from "@/lib/handoffs";
import { processDueFlowWaits } from "@/lib/engine";
import { deliverMetaJob } from "@/lib/meta";
import { heartbeat, logOps } from "@/lib/ops";
import { qstashSignatureGate } from "@/lib/qstash";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Wave 9 (item 2): this route is QStash-invoked (the 5-minute schedule), so
  // it gets the same signature gate as the ingest worker.
  const signatureGate = await qstashSignatureGate(request);
  if (!signatureGate.ok) {
    await logOps("warning", "scheduler", "Rejected cron request: bad QStash signature", {
      reason: signatureGate.reason,
    });
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }

  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json({ error: "Scheduler secret is not configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await heartbeat("scheduler");
  const delivery = await processDueJobs(deliverMetaJob);
  const handoffsResumed = await processDueHandoffResumes();
  // Wave 4: fire timed-out flow waits (resume at nextTimeout, or end the run).
  const flowWaits = await processDueFlowWaits();
  return NextResponse.json({ ...delivery, handoffsResumed, flowWaits });
}
