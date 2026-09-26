import { lookup } from "node:dns/promises";
import { getDefaultBrand } from "@/lib/brands";
import { logOps } from "@/lib/ops";
import { addAudit, getBrandConfig, loadState, mutateState } from "@/lib/store";
import type { BrandKey, YochatState } from "@/lib/types";

/**
 * Wave 7 — bounded outbound HTTP for flow `http_request` nodes.
 *
 * Outbound HTTP is a safe, bounded primitive instead of an open door:
 *  1. Per-brand URL allowlist (deny by default; enforced at publish AND at
 *     execution time — the allowlist is the PRIMARY control).
 *  2. Hard 10s timeout + 256KB response cap (serverless-safe; timeouts are
 *     recorded outcomes, never hanging runs).
 *  3. Per-brand write-only secret store; {{secret:NAME}} resolved at
 *     execution time in memory only, never in logs/traces/audits.
 *  4. One audit record per call (method + host only — never query strings,
 *     bodies, or secret values).
 *  5. SSRF guardrails: private/internal address space blocked
 *     (defense-in-depth behind the allowlist).
 *
 * KNOWN LIMITATION (documented): DNS-rebinding is out of scope for this
 * pass. A hostname is resolved once per request; a hostile DNS that flips
 * between the check and the fetch (or across redirects) is not detected.
 * The allowlist remains the primary control.
 *
 * Non-goals: retries with backoff (one attempt + recorded outcome; flows
 * are not a job queue), OAuth, webhook receivers, a public third-party API.
 */

export const HTTP_TIMEOUT_MS = 10_000;
export const HTTP_MAX_BODY_BYTES = 256 * 1024; // 256KB
export const HTTP_MAX_REDIRECTS = 3;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export type HttpOutcomeKind = "success" | "timeout" | "denied" | "error" | "skipped";

export type HttpOutcome = {
  outcome: HttpOutcomeKind;
  method: string;
  /** Host only — never the full URL (query strings may carry tokens). */
  host: string;
  status?: number;
  /** Bytes actually read, capped at HTTP_MAX_BODY_BYTES. */
  responseBytes: number;
  truncated: boolean;
  /** Secret NAMES used (never values). */
  secretNames: string[];
  error?: string;
};

export type HttpExecuteInput = {
  brand: BrandKey;
  flowId: string;
  nodeId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

/** Policy denial (allowlist / SSRF) — distinct from execution failures. */
export class HttpDeniedError extends Error {}
/** Bad node config (bad URL/method/unknown secret) — operator-fixable. */
export class HttpConfigError extends Error {}

const SECRET_PLACEHOLDER_RE = /\{\{\s*secret\s*:\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*\}\}/g;

/** An allowlist entry matches the host exactly or any subdomain. */
export function isHostAllowlisted(host: string, allowlist: string[]): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  for (const raw of allowlist) {
    const entry = raw.toLowerCase().replace(/\.$/, "");
    if (!entry) continue;
    if (normalized === entry || normalized.endsWith(`.${entry}`)) return true;
  }
  return false;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    value = value * 256 + byte;
  }
  return value >>> 0;
}

function isIpLiteral(host: string): boolean {
  return ipv4ToInt(host) !== null || host.includes(":");
}

/** True for loopback, RFC1918, link-local, CGNAT-shared, and IPv6 ULA/link-local. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    const inRange = (base: string, bits: number) => {
      const baseInt = ipv4ToInt(base)!;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (v4 & mask) === (baseInt & mask);
    };
    return (
      inRange("127.0.0.0", 8) ||
      inRange("10.0.0.0", 8) ||
      inRange("172.16.0.0", 12) ||
      inRange("192.168.0.0", 16) ||
      inRange("169.254.0.0", 16) ||
      inRange("100.64.0.0", 10) ||
      inRange("0.0.0.0", 8)
    );
  }
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fec0:")
  );
}

/**
 * SSRF guardrail: blocks private/internal address space, including cloud
 * metadata endpoints (169.254.169.254). Throws HttpDeniedError.
 *
 * Test escape hatch: with YOCHAT_TEST_MODE=1 the literal hostname
 * "localhost" is allowed so the smoke suite can hit a local fixture route.
 * Never enabled in production; the allowlist still applies.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (lower === "localhost" && process.env.YOCHAT_TEST_MODE === "1") return;
  if (isIpLiteral(lower)) {
    if (isPrivateIp(lower)) {
      throw new HttpDeniedError(`blocked: ${lower} is private/internal address space (SSRF guardrail)`);
    }
    return;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(lower, { all: true });
  } catch {
    throw new HttpConfigError(`could not resolve host "${lower}"`);
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new HttpDeniedError(
        `blocked: ${lower} resolves to private/internal address ${record.address} (SSRF guardrail)`,
      );
    }
  }
}

function resolveSecretsInText(
  template: string,
  secrets: Record<string, string>,
): { text: string; usedNames: string[] } {
  const used = new Set<string>();
  const text = template.replace(SECRET_PLACEHOLDER_RE, (_match, name: string) => {
    const value = secrets[name];
    if (value === undefined) {
      throw new HttpConfigError(`unknown secret "${name}" for this brand (add it via /api/admin/integrations)`);
    }
    used.add(name);
    return value;
  });
  return { text, usedNames: [...used] };
}

/** Best-effort: never let a secret value leak into an error string. */
function scrubSecrets(text: string, values: string[]): string {
  let scrubbed = text;
  for (const value of values) {
    if (value) scrubbed = scrubbed.split(value).join("[redacted]");
  }
  return scrubbed;
}

async function readCapped(response: Response): Promise<{ bytes: number; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: 0, truncated: false };
  let bytes = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > HTTP_MAX_BODY_BYTES) {
        truncated = true;
        bytes = HTTP_MAX_BODY_BYTES;
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { bytes, truncated };
}

async function writeHttpAudit(input: {
  brand: BrandKey;
  flowId: string;
  nodeId: string;
  outcome: HttpOutcome;
  redirects: number;
}): Promise<void> {
  const { brand, flowId, nodeId, outcome, redirects } = input;
  await mutateState((state) => {
    addAudit(state, {
      action: "http.outbound",
      actor: "flow",
      target: flowId,
      // Deliberately minimal: method + host only. NEVER query strings
      // (may carry tokens), request/response bodies, or secret values.
      detail: {
        brand,
        flowId,
        nodeId,
        method: outcome.method,
        host: outcome.host,
        status: outcome.status,
        outcome: outcome.outcome,
        responseBytes: outcome.responseBytes,
        truncated: outcome.truncated,
        secretNames: outcome.secretNames,
        redirects,
        error: outcome.error,
      },
    });
  });
  await logOps(
    outcome.outcome === "denied" || outcome.outcome === "error" ? "warning" : "info",
    "http",
    `outbound ${outcome.method} ${outcome.host} -> ${outcome.outcome}${outcome.status ? ` ${outcome.status}` : ""}`,
    { brand, flowId, nodeId },
  );
}

/**
 * The bounded outbound-HTTP primitive. One attempt, hard timeout, capped
 * body, manual redirect following (re-checked per hop). Always settles —
 * timeouts abort the fetch and are returned as outcomes, never hangs.
 */
export async function executeBoundedHttp(input: HttpExecuteInput): Promise<HttpOutcome> {
  const method = input.method.toUpperCase();
  let outcome: HttpOutcome | undefined;
  let redirects = 0;
  const usedNames = new Set<string>();

  try {
    if (!HTTP_METHODS.has(method)) {
      throw new HttpConfigError(`unsupported http method "${input.method}" (GET|POST|PUT|PATCH|DELETE)`);
    }
    const brandConfig = await getBrandConfig(input.brand);
    const allowlist = brandConfig.httpAllowlist ?? [];
    const state = await loadState();
    const secrets: Record<string, string> = { ...(state.brandSecrets[input.brand] ?? {}) };

    // Resolve secrets BEFORE parsing: a secret could supply any part of the
    // request. Names (not values) are tracked for the audit record.
    const resolvePart = (template: string): string => {
      const resolved = resolveSecretsInText(template, secrets);
      for (const name of resolved.usedNames) usedNames.add(name);
      return resolved.text;
    };
    const resolvedUrl = resolvePart(input.url);
    const resolvedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      resolvedHeaders[key] = resolvePart(value);
    }
    const resolvedBody = input.body !== undefined ? resolvePart(input.body) : undefined;

    let current: URL;
    try {
      current = new URL(resolvedUrl);
    } catch {
      throw new HttpConfigError(`invalid httpUrl "${input.url.slice(0, 120)}"`);
    }
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new HttpConfigError(`httpUrl must use http(s), got "${current.protocol}"`);
    }
    const checkTarget = (url: URL): void => {
      if (!isHostAllowlisted(url.hostname, allowlist)) {
        throw new HttpDeniedError(
          `denied: host "${url.hostname}" is not in brand ${input.brand}'s allowlist (deny by default)`,
        );
      }
    };

    checkTarget(current);
    await assertPublicHost(current.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      let status: number | undefined;
      let bytes = 0;
      let truncated = false;
      for (;;) {
        const response = await fetch(current.toString(), {
          method,
          headers: resolvedHeaders,
          body: method === "GET" ? undefined : resolvedBody,
          redirect: "manual",
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400 && redirects < HTTP_MAX_REDIRECTS) {
          const location = response.headers.get("location");
          await response.body?.cancel().catch(() => undefined);
          if (!location) {
            status = response.status;
            break;
          }
          const next = new URL(location, current);
          if (next.protocol !== "http:" && next.protocol !== "https:") {
            throw new HttpDeniedError(`denied: redirect to non-http(s) target blocked`);
          }
          checkTarget(next);
          await assertPublicHost(next.hostname);
          current = next;
          redirects += 1;
          continue;
        }
        status = response.status;
        const read = await readCapped(response);
        bytes = read.bytes;
        truncated = read.truncated;
        break;
      }
      outcome = {
        outcome: "success",
        method,
        host: current.hostname,
        status,
        responseBytes: bytes,
        truncated,
        secretNames: [...usedNames],
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const state = await loadState().catch(() => undefined);
    const values = state ? Object.values(state.brandSecrets[input.brand] ?? {}) : [];
    const raw = error instanceof Error ? error.message : "Unknown HTTP error";
    const message = scrubSecrets(raw, values).slice(0, 300);
    if (error instanceof HttpDeniedError) {
      let host = "";
      try {
        host = new URL(input.url).hostname;
      } catch {
        host = "";
      }
      outcome = {
        outcome: "denied",
        method,
        host,
        responseBytes: 0,
        truncated: false,
        secretNames: [...usedNames],
        error: message,
      };
    } else if (error instanceof Error && error.name === "AbortError") {
      let host = "";
      try {
        host = new URL(input.url).hostname;
      } catch {
        host = "";
      }
      outcome = {
        outcome: "timeout",
        method,
        host,
        responseBytes: 0,
        truncated: false,
        secretNames: [...usedNames],
        error: `timed out after ${HTTP_TIMEOUT_MS / 1000}s (hard cap)`,
      };
    } else {
      let host = "";
      try {
        host = new URL(input.url).hostname;
      } catch {
        host = "";
      }
      outcome = {
        outcome: "error",
        method,
        host,
        responseBytes: 0,
        truncated: false,
        secretNames: [...usedNames],
        error: message,
      };
    }
  }

  const finalOutcome = outcome!;
  await writeHttpAudit({ brand: input.brand, flowId: input.flowId, nodeId: input.nodeId, outcome: finalOutcome, redirects });
  return finalOutcome;
}

// ─── Secret store (write-only) ───

/** Values live here ONLY in server memory paths; never returned to callers. */
export async function getBrandSecrets(brand: BrandKey): Promise<Record<string, string>> {
  const state = await loadState();
  return { ...(state.brandSecrets[brand] ?? {}) };
}

/** Names are safe to expose; values never are. */
export async function listBrandSecretNames(brand: BrandKey): Promise<string[]> {
  return Object.keys(await getBrandSecrets(brand)).sort();
}

export async function setBrandSecret(brand: BrandKey, name: string, value: string, actor = "admin"): Promise<void> {
  await mutateState((state) => {
    state.brandSecrets[brand] ??= {};
    state.brandSecrets[brand][name] = value;
    // Audit the ROTATION, never the value.
    addAudit(state, { action: "integration.secret_set", actor, target: brand, detail: { brand, name } });
  });
}

export async function deleteBrandSecret(brand: BrandKey, name: string, actor = "admin"): Promise<boolean> {
  return mutateState((state) => {
    const store = state.brandSecrets[brand];
    if (!store || !(name in store)) return false;
    delete store[name];
    addAudit(state, { action: "integration.secret_deleted", actor, target: brand, detail: { brand, name } });
    return true;
  });
}

// ─── Validation context (publish-time allowlist + secret checks) ───

export type HttpValidationContext = {
  allowlist: string[];
  secretNames: string[];
};

export function httpValidationContextFromState(state: YochatState, brand: BrandKey): HttpValidationContext {
  const override = state.brandOverrides[brand]?.httpAllowlist;
  return {
    allowlist: override ?? getDefaultBrand(brand).httpAllowlist ?? [],
    secretNames: Object.keys(state.brandSecrets[brand] ?? {}),
  };
}

export async function getHttpValidationContext(brand: BrandKey): Promise<HttpValidationContext> {
  const state = await loadState();
  return httpValidationContextFromState(state, brand);
}

/** All {{secret:NAME}} references across the node's config. */
export function referencedSecretNames(config: {
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpBody?: string;
}): string[] {
  const found = new Set<string>();
  const scan = (text: string | undefined): void => {
    if (!text) return;
    for (const match of text.matchAll(SECRET_PLACEHOLDER_RE)) found.add(match[1]);
  };
  scan(config.httpUrl);
  scan(config.httpBody);
  for (const value of Object.values(config.httpHeaders ?? {})) scan(value);
  return [...found];
}
