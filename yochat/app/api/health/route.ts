import { NextResponse } from "next/server";
import { storageMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const persistent = storageMode() === "redis";
  const metaConfigured = Boolean(
    process.env.META_VERIFY_TOKEN &&
    process.env.META_APP_SECRET &&
    process.env.META_INSTAGRAM_APP_SECRET &&
    process.env.META_PAGE_ACCESS_TOKENS_JSON &&
    process.env.META_INSTAGRAM_ACCESS_TOKENS_JSON,
  );
  return NextResponse.json(
    {
      status: metaConfigured ? (persistent ? "ok" : "degraded") : "configuration_required",
      service: "yochat-messenger-webhook",
      timestamp: new Date().toISOString(),
      checks: {
        meta: metaConfigured,
        ai: Boolean(process.env.NVIDIA_API_KEY),
        persistentStorage: persistent,
        admin: Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
