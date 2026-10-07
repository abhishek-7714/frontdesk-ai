import { NextResponse } from "next/server";
import { getLatestSnapshot, getTodayStats } from "@/lib/core/calls";
import { openDeskNotes } from "@/lib/core/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snapshot, stats, notes] = await Promise.all([getLatestSnapshot(), getTodayStats(), openDeskNotes()]);
    return NextResponse.json({ ...snapshot, stats, notes }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[latest] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ call: null, events: [], stats: null, notes: [] }, { status: 500 });
  }
}
