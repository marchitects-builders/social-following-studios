import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { deleteBrandSecret, listBrandSecretNames, setBrandSecret } from "@/lib/http";
import { addAudit, getBrandConfig, mutateState, updateBrandConfig } from "@/lib/store";
import type { BrandKey } from "@/lib/types";
import { verifyCsrfToken } from "@/lib/csrf";

/**
 * Wave 7 — bounded outbound HTTP, admin surface.
 *
 * GET  /api/admin/integrations?brand=      → { brand, allowlist, secretNames }
 * POST /api/admin/integrations             → actions: set_allowlist | add_secret | delete_secret
 *
 * Secret values are WRITE-ONLY: no read API, response, log, audit record,
 * or trace ever carries a value — only names.
 */

const allowedBrands = new Set<BrandKey>(["marchitects", "social-following", "aafc"]);
const MAX_ALLOWLIST_ENTRIES = 100;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,64}$/;
const MAX_SECRET_BYTES = 4096;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function requireBrand(value: unknown): BrandKey | undefined {
  return typeof value === "string" && allowedBrands.has(value as BrandKey) ? (value as BrandKey) : undefined;
}

function normalizeHosts(hosts: unknown): string[] | undefined {
  if (!Array.isArray(hosts) || hosts.length > MAX_ALLOWLIST_ENTRIES) return undefined;
  const normalized: string[] = [];
  for (const entry of hosts) {
    if (typeof entry !== "string") return undefined;
    const host = entry.trim().toLowerCase();
    if (!HOST_RE.test(host) || host.includes("..")) return undefined;
    normalized.push(host);
  }
  return [...new Set(normalized)];
}

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brand = requireBrand(new URL(request.url).searchParams.get("brand"));
  if (!brand) return badRequest("a valid brand query param is required");
  const config = await getBrandConfig(brand);
  const response = NextResponse.json({
    brand,
    // The allowlist is operator config (not secret); names only for secrets.
    allowlist: config.httpAllowlist ?? [],
    secretNames: await listBrandSecretNames(brand),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

type ActionBody = {
  action?: "set_allowlist" | "add_secret" | "delete_secret";
  brand?: BrandKey;
  hosts?: unknown;
  name?: string;
  value?: string;
};

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Wave 9 (item 5): CSRF synchronizer token required on admin mutations.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as ActionBody;
  const brand = requireBrand(body.brand);
  if (!brand) return badRequest("a valid brand is required");

  try {
    switch (body.action) {
      case "set_allowlist": {
        const hosts = normalizeHosts(body.hosts);
        if (!hosts) {
          return badRequest(
            `hosts must be an array of ≤${MAX_ALLOWLIST_ENTRIES} plain hostnames (no scheme, path, or port)`,
          );
        }
        const config = await updateBrandConfig(brand, { httpAllowlist: hosts }, "admin");
        await mutateState((state) => {
          addAudit(state, {
            action: "integration.allowlist_set",
            actor: "admin",
            target: brand,
            detail: { brand, hosts },
          });
        });
        return NextResponse.json({ ok: true, brand, allowlist: config.httpAllowlist ?? [] });
      }
      case "add_secret": {
        if (typeof body.name !== "string" || !SECRET_NAME_RE.test(body.name)) {
          return badRequest("name must match ^[A-Z][A-Z0-9_]{1,64}$");
        }
        if (typeof body.value !== "string" || body.value.length === 0 || body.value.length > MAX_SECRET_BYTES) {
          return badRequest(`value is required (1–${MAX_SECRET_BYTES} chars)`);
        }
        await setBrandSecret(brand, body.name, body.value, "admin");
        // The VALUE never appears in any response.
        return NextResponse.json({ ok: true, brand, secretNames: await listBrandSecretNames(brand) });
      }
      case "delete_secret": {
        if (typeof body.name !== "string" || !SECRET_NAME_RE.test(body.name)) {
          return badRequest("a valid secret name is required");
        }
        const deleted = await deleteBrandSecret(brand, body.name, "admin");
        if (!deleted) return badRequest(`secret "${body.name}" does not exist for ${brand}`);
        return NextResponse.json({ ok: true, brand, secretNames: await listBrandSecretNames(brand) });
      }
      default:
        return badRequest("action is required (set_allowlist|add_secret|delete_secret)");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown integrations error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
