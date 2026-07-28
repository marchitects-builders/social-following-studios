import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { dashboardSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await dashboardSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
