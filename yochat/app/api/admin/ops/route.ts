import { NextResponse } from "next/server";
import type { BrandKey } from "@/lib/types";
import { isAdminRequest } from "@/lib/admin-auth";
import { getHeartbeats, getRecentOps, type OpsLevel } from "@/lib/ops";
import { getRateLimitUsage, reserveSendSlot, releaseSendSlot } from "@/lib/rate-limit";
import { classifySendError } from "@/lib/send-errors";
import { authorizeOutbound, type OutboundAuthContext } from "@/lib/jobs";
import { keyedParityCheck } from "@/lib/store-keys";
import { isTestActionsEnabled } from "@/lib/test-gate";
import { opsRedisCredentials, stateRedisCredentials } from "@/lib/redis";
import { loadState } from "@/lib/store";
import { verifyCsrfToken } from "@/lib/csrf";

/**
 * Admin operational diagnostics (Wave 1 + Wave 2). Actions:
 * - heartbeats: staleness of background processors
 * - ops: recent operational events, optionally filtered by level
 * - ratelimit_check: probe a brand/channel slot (reserves then releases, no net effect)
 * - ratelimit_usage: current bucket usage snapshot
 * - classify_error: run a message through the send-error classifier
 * - authorize_outbound: probe the outbound-send seatbelt for a brand/channel/recipient
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
    channel?: string;
    level?: OpsLevel;
    limit?: number;
    message?: string;
    recipientId?: string;
    contactId?: string;
    flowId?: string;
    jobId?: string;
    aiGenerated?: boolean;
    consentAck?: boolean;
    handoffAck?: boolean;
  };

  switch (body.action) {
    case "heartbeats":
      return NextResponse.json({ heartbeats: await getHeartbeats() });

    case "ops": {
      const level: OpsLevel | undefined =
        body.level === "info" || body.level === "warning" || body.level === "error" ? body.level : undefined;
      const limit = Number(body.limit ?? 50);
      return NextResponse.json({ events: await getRecentOps(Number.isFinite(limit) ? limit : 50, level) });
    }

    case "ratelimit_check": {
      if (!body.brand || !body.channel) {
        return NextResponse.json({ error: "brand and channel are required" }, { status: 400 });
      }
      const allowed = await reserveSendSlot(body.brand, body.channel);
      if (allowed) await releaseSendSlot(body.brand, body.channel);
      const usage = await getRateLimitUsage(body.brand, body.channel);
      return NextResponse.json({ allowed, usage });
    }

    case "ratelimit_usage": {
      if (!body.brand || !body.channel) {
        return NextResponse.json({ error: "brand and channel are required" }, { status: 400 });
      }
      return NextResponse.json({ usage: await getRateLimitUsage(body.brand, body.channel) });
    }

    case "classify_error":
      return NextResponse.json({ class: classifySendError(body.message ?? "") });

    case "authorize_outbound": {
      if (!body.brand || !body.channel || !body.recipientId) {
        return NextResponse.json({ error: "brand, channel, and recipientId are required" }, { status: 400 });
      }
      const auth: OutboundAuthContext = {
        brand: body.brand as OutboundAuthContext["brand"],
        channel: body.channel as OutboundAuthContext["channel"],
        recipientId: body.recipientId,
        kind: "automated",
        contactId: body.contactId,
        flowId: body.flowId,
        aiGenerated: body.aiGenerated === true,
        consentAck: body.consentAck === true,
        handoffAck: body.handoffAck === true,
      };
      return NextResponse.json(await authorizeOutbound(auth));
    }

    case "job_status": {
      // Wave 4: read-only delivery-job inspection (supports claim-before-send tests).
      if (!body.jobId) {
        return NextResponse.json({ error: "jobId is required" }, { status: 400 });
      }
      const state = await loadState();
      const job = state.jobs[body.jobId];
      if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
      return NextResponse.json({ job });
    }

    case "ai_budget": {
      // Wave 5: per-brand daily AI token/cost accounting.
      const { getAiDiagnostics } = await import("@/lib/ai-budget");
      return NextResponse.json(await getAiDiagnostics());
    }

    case "keyed_migration_status": {
      // Wave 9 (item 1): blob-extraction migration parity report.
      const state = await loadState();
      return NextResponse.json(await keyedParityCheck(state));
    }

    case "keyed_probe": {
      // Wave 9 (item 1): migration fixture — write-new/read-old and
      // write-old/read-new round-trips for contacts and transcripts.
      const { keyedProbeRoundTrip } = await import("@/lib/store");
      return NextResponse.json(await keyedProbeRoundTrip());
    }

    case "redis_creds_status": {
      // Wave 9 (item 8): which credential scopes are configured (booleans
      // only — values are never exposed).
      const stateCreds = stateRedisCredentials();
      const opsCreds = opsRedisCredentials();
      return NextResponse.json({
        state: { configured: Boolean(stateCreds.url && stateCreds.token) },
        ops: { configured: Boolean(opsCreds.url && opsCreds.token) },
        separate: Boolean(
          process.env.UPSTASH_REDIS_STATE_URL || process.env.UPSTASH_REDIS_STATE_TOKEN ||
          process.env.UPSTASH_REDIS_OPS_URL || process.env.UPSTASH_REDIS_OPS_TOKEN,
        ),
      });
    }

    case "outbound_auth_log": {
      // Wave 9 (item 7): audit records for every outbound authorization
      // decision (allow/deny + reason), most recent first.
      const limit = Math.min(200, Math.max(1, Number(body.limit ?? 50) || 50));
      const state = await loadState();
      const entries = state.audits
        .filter((audit) => audit.action === "outbound.auth")
        .slice(-limit)
        .reverse();
      return NextResponse.json({ entries, count: entries.length });
    }

    case "test_action_gate": {
      // Wave 9 (item 9a): proves the test-only action gate reads the live env.
      // The production-mode branch is unit-tested by importing
      // lib/test-gate.ts in a plain node child process with
      // NODE_ENV=production (see the Wave 9 smoke checks).
      return NextResponse.json({ enabled: isTestActionsEnabled(), nodeEnv: process.env.NODE_ENV ?? "unset" });
    }

    case "qstash_status": {
      // Wave 9 (item 2): proves the QStash signature gate is live in this run.
      const { qstashSignatureConfigured } = await import("@/lib/qstash");
      return NextResponse.json({ signatureConfigured: qstashSignatureConfigured() });
    }

    case "keyed_get_contact": {
      // Wave 9 (item 4): tenant-isolation diagnostic — keyed contact lookup is
      // brand-scoped; a cross-brand contactId resolves to null.
      if (!body.brand || !body.contactId) {
        return NextResponse.json({ error: "brand and contactId are required" }, { status: 400 });
      }
      const { getKeyedContact } = await import("@/lib/store");
      const contact = await getKeyedContact(body.brand as BrandKey, body.contactId);
      return NextResponse.json({ contact: contact ?? null });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
