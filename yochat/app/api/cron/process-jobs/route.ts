import { NextResponse } from "next/server";
import { processDueJobs } from "@/lib/jobs";
import { deliverMetaJob } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json({ error: "Scheduler secret is not configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processDueJobs(deliverMetaJob));
}
