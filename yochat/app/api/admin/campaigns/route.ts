import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  AAFC_BETA_TEST_CONTACT,
  getAafcMailingListBetaReport,
  resetAafcMailingListBetaTest,
  startAafcMailingListBetaTest,
} from "@/lib/campaigns";
import { getDefaultBrand } from "@/lib/brands";
import { processIncomingEvent } from "@/lib/engine";

async function sendTestReply(text: string) {
  const brand = getDefaultBrand("aafc");
  return processIncomingEvent({
    id: `campaign:aafc-mailing-list-beta:${randomUUID()}`,
    channel: "test",
    accountId: brand.instagramId,
    senderId: AAFC_BETA_TEST_CONTACT.externalId,
    username: AAFC_BETA_TEST_CONTACT.username,
    trigger: "message",
    text,
    timestamp: new Date().toISOString(),
    metadata: {
      campaignBeta: true,
      name: AAFC_BETA_TEST_CONTACT.name,
      email: AAFC_BETA_TEST_CONTACT.email,
      phone: AAFC_BETA_TEST_CONTACT.phone,
    },
  });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getAafcMailingListBetaReport());
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    action?: "start" | "reply" | "run_full" | "reset";
    text?: string;
  };

  if (body.action === "reset") {
    await resetAafcMailingListBetaTest();
    return NextResponse.json({ ok: true, report: await getAafcMailingListBetaReport() });
  }

  if (body.action === "start") {
    const delivery = await startAafcMailingListBetaTest();
    return NextResponse.json({ ok: true, delivery, report: await getAafcMailingListBetaReport() });
  }

  if (body.action === "reply") {
    if (!body.text?.trim()) return NextResponse.json({ error: "A test reply is required" }, { status: 400 });
    const result = await sendTestReply(body.text.trim());
    return NextResponse.json({
      ok: !result.ignored,
      result: {
        intent: result.intent,
        reply: result.reply,
        ignored: result.ignored,
        contact: result.contact,
      },
      report: await getAafcMailingListBetaReport(),
    });
  }

  if (body.action === "run_full") {
    await resetAafcMailingListBetaTest();
    await startAafcMailingListBetaTest();

    const fallback = await sendTestReply("Please add me to the updates");
    const samples = ["Mailing List", "MAILING LIST", "mailing list", "  Mailing   List!  "];
    const keywordCases = [];
    for (const text of samples) {
      const result = await sendTestReply(text);
      keywordCases.push({
        text,
        passed:
          result.intent === "lead_capture" &&
          result.reply ===
            "You’re officially on the mailing list. We’ll keep you updated with new announcements, opportunities, and important information.",
        intent: result.intent,
        reply: result.reply,
      });
    }

    const report = await getAafcMailingListBetaReport();
    const checks = [
      {
        name: "Initial campaign message delivered",
        passed: report.initialMessageStatus === "Delivered — internal test mode",
        detail: report.initialMessageStatus,
      },
      {
        name: "Reply received by YoChat",
        passed: report.replyReceived,
        detail: report.replyReceived ? "Reply appears in the campaign activity log." : "No reply activity found.",
      },
      {
        name: "Non-matching reply handled",
        passed: fallback.reply === "To join the mailing list, reply MAILING LIST.",
        detail: fallback.reply ?? "No fallback reply generated.",
      },
      {
        name: "All keyword formats recognized",
        passed: keywordCases.every((item) => item.passed),
        detail: `${keywordCases.filter((item) => item.passed).length}/${keywordCases.length} formats passed.`,
      },
      {
        name: "Mailing-list subscription created",
        passed: report.mailingListSubscriptionStatus === "subscribed" && Boolean(report.joinedAt),
        detail: `${report.mailingListSubscriptionStatus}${report.joinedAt ? ` at ${report.joinedAt}` : ""}`,
      },
      {
        name: "Contact information preserved",
        passed: Boolean(report.testContact?.name && report.testContact?.email && report.testContact?.phone),
        detail: report.testContact
          ? `${report.testContact.name} · ${report.testContact.email} · ${report.testContact.phone}`
          : "Test contact not found.",
      },
      {
        name: "Beta tag applied",
        passed: report.tagStatus === "applied",
        detail: `${report.tag}: ${report.tagStatus}`,
      },
      {
        name: "Campaign response marked successful",
        passed: report.campaignResponseStatus === "successful",
        detail: report.campaignResponseStatus,
      },
      {
        name: "Confirmation delivered",
        passed: report.confirmationMessageStatus === "Delivered — internal test mode",
        detail: report.confirmationMessageStatus,
      },
      {
        name: "Campaign activity recorded",
        passed:
          report.activityLog.some((activity) => activity.type === "initial_message_delivered") &&
          report.activityLog.some((activity) => activity.type === "reply_received") &&
          report.activityLog.some((activity) => activity.type === "confirmation_sent"),
        detail: `${report.activityLog.length} campaign activity entries recorded.`,
      },
      {
        name: "Duplicate subscription prevented",
        passed: report.subscriptionCountForIdentity === 1 && report.duplicatePrevented,
        detail: `${report.subscriptionCountForIdentity} subscription entry; duplicate guard ${
          report.duplicatePrevented ? "confirmed" : "not confirmed"
        }.`,
      },
      {
        name: "Campaign remains test-only",
        passed: report.campaign?.mode === "test" && report.campaign?.audience === "test-only",
        detail: `${report.campaign?.status ?? "unknown"} · ${report.campaign?.audience ?? "unknown"}`,
      },
    ];
    const passed = checks.filter((check) => check.passed).length;
    return NextResponse.json({
      ok: passed === checks.length,
      passed,
      total: checks.length,
      checks,
      keywordCases,
      report,
      note: "All deliveries used the internal test channel. No real AAFC contact or full list was messaged.",
    });
  }

  return NextResponse.json({ error: "Unsupported campaign action" }, { status: 400 });
}
