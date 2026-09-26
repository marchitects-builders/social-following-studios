/**
 * Meta send-error classification (Wave 1).
 *
 * Not all send failures deserve the same retry behavior. Classifying the
 * error before deciding prevents burning retry attempts on failures that
 * will never succeed (closed 24h window, bad recipient) and enables
 * targeted recovery (template rejection -> plain-text downgrade).
 *
 * Pure module: no imports, safe to use from both lib/meta.ts and lib/jobs.ts.
 */

export type SendErrorClass =
  | "template_rejected" // rich/template content rejected -> retry once as plain text
  | "window_closed" // outside Meta's 24h messaging window -> do not retry
  | "rate_limited" // Meta 429 / throttled -> requeue with delay, don't count attempt
  | "auth" // token/permission problem -> fail fast + alert
  | "permanent" // bad recipient / undeliverable -> do not retry
  | "transient"; // 5xx, network, unknown -> normal backoff

const PATTERNS: Array<{ test: RegExp; class: SendErrorClass }> = [
  { test: /outside (of |the )?allowed window|24\s?h(our)? window|messaging window/i, class: "window_closed" },
  { test: /template|invalid for a private reply|buttons? not (supported|allowed)/i, class: "template_rejected" },
  { test: /rate.?limit|too many requests|\b429\b|error.?368|throttl/i, class: "rate_limited" },
  { test: /invalid (oauth )?token|token expired|permission denied|\(#190\)|oauth/i, class: "auth" },
  { test: /recipient (not found|unavailable)|user (not found|cannot be (found|messaged))|does not exist|undeliverable/i, class: "permanent" },
];

export function classifySendError(error: unknown): SendErrorClass {
  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const { test, class: errorClass } of PATTERNS) {
    if (test.test(message)) return errorClass;
  }
  return "transient";
}
