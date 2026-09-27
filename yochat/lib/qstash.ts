/**
 * Minimal QStash REST client (Wave 1).
 *
 * Used for durable webhook ingestion: the webhook route publishes one message
 * per verified event and returns 200 immediately; the ingest worker processes
 * it. When QSTASH_TOKEN is not configured (local/dev/test), callers fall back
 * to inline processing — no behavior change without credentials.
 */

import { Receiver } from "@upstash/qstash";

export function qstashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

function qstashApi(): string {
  return process.env.QSTASH_URL ?? "https://qstash.upstash.io";
}

/**
 * Publish a JSON message to a destination URL via QStash.
 * The destination is appended to the publish path verbatim (not encoded),
 * matching the pattern already used by the scheduler route.
 */
export async function publishToQStash(destinationUrl: string, body: unknown): Promise<{ messageId?: string }> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QStash is not configured");

  const response = await fetch(`${qstashApi()}/v2/publish/${destinationUrl}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Forward-Authorization": process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "",
      "Upstash-Retries": "3",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { messageId?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `QStash publish returned HTTP ${response.status}`);
  return { messageId: payload.messageId };
}

/**
 * Wave 9 (item 2) — QStash signature verification (Gemini R3: biggest
 * security payoff).
 *
 * The QStash-receiving endpoints (/api/ingest/process, /api/cron/process-jobs)
 * are public URLs. Without verification, anyone can curl them and forge
 * payloads — triggering LLM loops or spamming contacts. Every request must
 * carry a valid `Upstash-Signature` JWT, verified with the official
 * @upstash/qstash `Receiver.verify()`: it checks the HS256 signature against
 * QSTASH_CURRENT_SIGNING_KEY (falling back to QSTASH_NEXT_SIGNING_KEY during
 * rotation), the "Upstash" issuer, expiry, the destination-URL binding (the
 * `sub` claim must equal the request URL), and the body-hash binding (the
 * `body` claim must equal SHA-256 of the raw request body). A signature
 * minted for another endpoint, or replayed with a tampered body, is rejected.
 */

function qstashSigningKeys(): string[] {
  return [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY].filter(
    (key): key is string => Boolean(key),
  );
}

export function qstashSignatureConfigured(): boolean {
  return qstashSigningKeys().length > 0;
}

export type QStashVerification = { ok: true } | { ok: false; reason: string };

/**
 * Verify a QStash-signed request with the official Upstash Receiver.
 * Reads the raw body from a clone so the route handler can still parse it.
 */
export async function verifyQStashSignature(request: Request): Promise<QStashVerification> {
  const keys = qstashSigningKeys();
  if (keys.length === 0) return { ok: false, reason: "qstash signing keys not configured" };
  const signature = request.headers.get("upstash-signature");
  if (!signature) return { ok: false, reason: "missing Upstash-Signature" };

  // The SDK requires both keys in config (or both in env) — with only one
  // key configured it throws "No signing keys available" and every legit
  // signed request is rejected. War-room workstream (h), SEC-01: fall back
  // to the current key as the next key so single-key deployments get real
  // verification instead of a hard fail-closed outage (or an operator
  // "fixing" it by unsetting the key and going fail-open). Rotation still
  // works when a distinct next key is configured.
  const receiver = new Receiver({
    currentSigningKey: keys[0],
    nextSigningKey: keys[1] ?? keys[0],
  });
  try {
    await receiver.verify({
      signature,
      body: await request.clone().text(),
      url: request.url,
      // Small clock tolerance for expiry checks across machines.
      clockTolerance: 60,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid signature" };
  }
}

/**
 * Gate helper for QStash-receiving routes. When signing keys are configured,
 * a valid Upstash-Signature is REQUIRED (unsigned/forged → reject). When no
 * keys are configured, verification is skipped so local/dev/test keeps the
 * legacy bearer-only behavior — no behavior change without configuration.
 */
export async function qstashSignatureGate(
  request: Request,
): Promise<QStashVerification | { ok: true; skipped: true }> {
  if (!qstashSignatureConfigured()) return { ok: true, skipped: true };
  return verifyQStashSignature(request);
}
