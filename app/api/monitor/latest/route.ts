import { NextResponse } from "next/server";
import { getLatestSnapshot, getTodayStats } from "@/lib/core/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snapshot, stats] = await Promise.all([getLatestSnapshot(), getTodayStats()]);
    return NextResponse.json({ ...snapshot, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[latest] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ call: null, events: [], stats: null }, { status: 500 });
  }
}
