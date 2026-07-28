import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";

const SCHEDULE_ID = "yochat-followups-v1";

function configuration() {
  return {
    token: process.env.QSTASH_TOKEN,
    cronSecret: process.env.CRON_SECRET,
    api: process.env.QSTASH_URL ?? "https://qstash.upstash.io",
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { token, api } = configuration();
  if (!token) return NextResponse.json({ configured: false, active: false });
  const response = await fetch(`${api}/v2/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return NextResponse.json({ configured: true, active: false, error: `QStash returned HTTP ${response.status}` });
  const schedules = (await response.json()) as Array<{ scheduleId?: string; isPaused?: boolean; nextScheduleTime?: number }>;
  const schedule = schedules.find((item) => item.scheduleId === SCHEDULE_ID);
  return NextResponse.json({ configured: true, active: Boolean(schedule && !schedule.isPaused), schedule });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { token, cronSecret, api } = configuration();
  if (!token || !cronSecret) {
    return NextResponse.json({ error: "Connect QStash and the scheduler secret first" }, { status: 400 });
  }
  const origin = process.env.YOCHAT_PUBLIC_URL ?? new URL(request.url).origin;
  // QStash expects the destination URL verbatim in this path. Encoding the
  // entire URL leaves the scheme opaque to QStash and it rejects the endpoint.
  const destination = `${origin}/api/cron/process-jobs`;
  const response = await fetch(`${api}/v2/schedules/${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
      "Upstash-Cron": "*/5 * * * *",
      "Upstash-Schedule-Id": SCHEDULE_ID,
      "Upstash-Method": "GET",
      "Upstash-Forward-Authorization": `Bearer ${cronSecret}`,
      "Upstash-Redact-Fields": "header[Authorization]",
      "Upstash-Label": "yochat-followups",
      "Upstash-Retries": "3",
    },
    body: "",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { scheduleId?: string; error?: string };
  if (!response.ok) return NextResponse.json({ error: payload.error ?? `QStash returned HTTP ${response.status}` }, { status: 502 });
  return NextResponse.json({ ok: true, scheduleId: payload.scheduleId ?? SCHEDULE_ID, frequency: "Every 5 minutes" });
}
