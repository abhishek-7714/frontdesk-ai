import { NextResponse } from "next/server";
import { createCall } from "@/lib/core/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await createCall());
  } catch (err) {
    console.error("[calls] create failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start the call" }, { status: 500 });
  }
}
