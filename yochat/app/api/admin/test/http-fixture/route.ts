import { NextResponse } from "next/server";

/**
 * Wave 7 — test-only outbound-HTTP fixture. NEVER available in production.
 *
 * Lets the smoke suite exercise the bounded-HTTP primitive (success,
 * timeout, oversize, header echo) against the local dev server instead of
 * the real internet:
 *   ?mode=ok    → small fast JSON
 *   ?mode=slow  → 15s delay (exceeds the 10s hard timeout)
 *   ?mode=large → 512KB body (exceeds the 256KB cap)
 *   ?mode=echo  → echoes received request headers (proves secret resolution)
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const mode = new URL(request.url).searchParams.get("mode") ?? "ok";
  switch (mode) {
    case "slow":
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      return NextResponse.json({ ok: true, slow: true });
    case "large":
      return new Response("x".repeat(512 * 1024), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    case "echo": {
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return NextResponse.json({ ok: true, headers });
    }
    default:
      return NextResponse.json({ ok: true, at: new Date().toISOString() });
  }
}
