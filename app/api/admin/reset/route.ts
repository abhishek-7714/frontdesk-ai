import { NextResponse } from "next/server";
import { resetDemo } from "@/lib/core/calls";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = env().ADMIN_TOKEN;
  if (!token || req.headers.get("x-admin-token") !== token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, removed: await resetDemo() });
  } catch (err) {
    console.error("[reset] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
