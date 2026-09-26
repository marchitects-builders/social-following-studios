import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getBrandAnalytics, isAnalyticsWindow, isBrandKey, type AnalyticsWindow } from "@/lib/analytics";
import type { BrandKey } from "@/lib/types";

/**
 * Wave 6 — brand analytics rollup.
 *
 * GET /api/admin/analytics?brand=<brand>&window=<24h|7d|30d>
 *
 * - brand omitted → all three brands; window omitted → 24h.
 * - Metrics are computed on demand from TTL'd sources (see lib/analytics.ts
 *   retention policy) — no new persistent tables, no warehouse.
 */
export const dynamic = "force-dynamic";

const ALL_BRANDS: BrandKey[] = ["marchitects", "social-following", "aafc"];

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const brandParam = params.get("brand");
  const windowParam = params.get("window") ?? "24h";

  if (!isAnalyticsWindow(windowParam)) {
    return NextResponse.json(
      { error: "window must be one of 24h, 7d, 30d" },
      { status: 400 },
    );
  }
  if (brandParam !== null && !isBrandKey(brandParam)) {
    return NextResponse.json(
      { error: "brand must be one of marchitects, social-following, aafc" },
      { status: 400 },
    );
  }

  const window: AnalyticsWindow = windowParam;
  const brands: BrandKey[] = brandParam ? [brandParam] : ALL_BRANDS;
  const analytics = await Promise.all(brands.map((brand) => getBrandAnalytics(brand, window)));

  return NextResponse.json({ analytics }, { headers: { "Cache-Control": "no-store" } });
}
