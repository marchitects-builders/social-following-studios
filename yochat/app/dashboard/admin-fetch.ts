"use client";

/**
 * Wave 9 (item 5): admin fetch helper that attaches the CSRF synchronizer
 * token to every mutating request. The token is minted once per page load
 * from GET /api/admin/csrf (bound to the admin session cookie) and reused.
 * Safe (GET/HEAD) requests pass through untouched.
 */

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  csrfPromise ??= fetch("/api/admin/csrf", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`CSRF mint failed: HTTP ${response.status}`);
      const body = (await response.json()) as { csrfToken?: string };
      if (!body.csrfToken) throw new Error("CSRF mint returned no token");
      csrfToken = body.csrfToken;
      return csrfToken;
    })
    .catch((error: unknown) => {
      csrfPromise = null;
      throw error;
    });
  return csrfPromise;
}

export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return fetch(input, init);
  const token = await getCsrfToken();
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", token);
  return fetch(input, { ...init, headers });
}
