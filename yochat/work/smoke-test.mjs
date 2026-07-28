import { createHmac } from "node:crypto";

const base = "http://localhost:3000";

async function expect(name, response, status, body) {
  const text = await response.text();
  if (response.status !== status || (body !== undefined && text !== body)) {
    throw new Error(`${name} failed: HTTP ${response.status}, body ${JSON.stringify(text)}`);
  }
  console.log(`PASS ${name}`);
}

await expect("health", await fetch(`${base}/api/health`), 200);
await expect(
  "Meta verification",
  await fetch(`${base}/api/webhook?hub.mode=subscribe&hub.verify_token=local-verify-token&hub.challenge=123456`),
  200,
  "123456",
);
await expect(
  "bad verification token",
  await fetch(`${base}/api/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123456`),
  403,
);

const payload = JSON.stringify({ object: "page", entry: [] });
const signature = `sha256=${createHmac("sha256", "local-app-secret").update(payload).digest("hex")}`;
const instagramPayload = JSON.stringify({ object: "instagram", entry: [] });
const instagramSignature = `sha256=${createHmac("sha256", "local-instagram-secret").update(instagramPayload).digest("hex")}`;

await expect(
  "signed Meta event",
  await fetch(`${base}/api/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body: payload,
  }),
  200,
  "EVENT_RECEIVED",
);
await expect(
  "signed Instagram event",
  await fetch(`${base}/api/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": instagramSignature },
    body: instagramPayload,
  }),
  200,
  "EVENT_RECEIVED",
);
await expect(
  "bad Meta signature",
  await fetch(`${base}/api/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=bad" },
    body: payload,
  }),
  401,
);

await expect("protected dashboard", await fetch(`${base}/api/admin/dashboard`), 401);

const loginResponse = await fetch(`${base}/api/admin/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD ?? "local-system-test" }),
});
if (!loginResponse.ok) throw new Error(`admin login failed: HTTP ${loginResponse.status}`);
const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("admin login did not set a cookie");
console.log("PASS admin login");

const adminHeaders = { cookie, "content-type": "application/json" };
const testResponse = await fetch(`${base}/api/admin/test`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ brand: "aafc", trigger: "message", text: "I want to volunteer" }),
});
const testResult = await testResponse.json();
if (!testResponse.ok || testResult.intent !== "volunteer" || !testResult.reply) throw new Error("safe simulation failed");
console.log("PASS safe simulation");

const evaluationResponse = await fetch(`${base}/api/admin/evaluate`, { method: "POST", headers: { cookie } });
const evaluation = await evaluationResponse.json();
if (!evaluationResponse.ok || !evaluation.healthy || evaluation.passed !== evaluation.total) {
  throw new Error(`health suite failed: ${JSON.stringify(evaluation)}`);
}
console.log(`PASS full health suite (${evaluation.passed}/${evaluation.total})`);

const campaignResponse = await fetch(`${base}/api/admin/campaigns`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ action: "run_full" }),
});
const campaign = await campaignResponse.json();
if (
  !campaignResponse.ok ||
  !campaign.ok ||
  campaign.passed !== campaign.total ||
  campaign.keywordCases?.length !== 4 ||
  !campaign.keywordCases.every((item) => item.passed) ||
  campaign.report?.mailingListSubscriptionStatus !== "subscribed" ||
  campaign.report?.tagStatus !== "applied" ||
  campaign.report?.subscriptionCountForIdentity !== 1 ||
  !campaign.report?.duplicatePrevented
) {
  throw new Error(`AAFC mailing-list beta failed: ${JSON.stringify(campaign)}`);
}
console.log(`PASS AAFC mailing-list beta (${campaign.passed}/${campaign.total})`);

const dashboardResponse = await fetch(`${base}/api/admin/dashboard`, { headers: { cookie } });
const dashboard = await dashboardResponse.json();
if (!dashboardResponse.ok || !dashboard.settings || !dashboard.operational || dashboard.contacts.length === 0) {
  throw new Error("dashboard snapshot failed");
}
console.log("PASS dashboard snapshot");

const exportResponse = await fetch(`${base}/api/admin/export?format=csv`, { headers: { cookie } });
if (!exportResponse.ok || !(await exportResponse.text()).startsWith('"brand","channel"')) throw new Error("CSV export failed");
console.log("PASS contact export");

let response = await fetch(`${base}/api/admin/action`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ action: "set_global_pause", paused: true }),
});
if (!response.ok) throw new Error("global pause failed");
const pausedTest = await fetch(`${base}/api/admin/test`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ brand: "marchitects", trigger: "message", text: "I want to book", persona: "paused-check" }),
});
if ((await pausedTest.json()).ignored !== "system_paused") throw new Error("global pause did not stop automation");
response = await fetch(`${base}/api/admin/action`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ action: "set_global_pause", paused: false }),
});
if (!response.ok) throw new Error("global resume failed");
console.log("PASS emergency pause and resume");

const testConversation = dashboard.conversations.find((conversation) => conversation.channel === "test");
const manualResponse = await fetch(`${base}/api/admin/reply`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ conversationId: testConversation?.id, text: "This must not send" }),
});
if (manualResponse.status !== 400) throw new Error("test-account manual-send guard failed");
console.log("PASS test-account send guard");
