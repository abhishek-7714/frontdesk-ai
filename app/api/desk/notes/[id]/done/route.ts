import { NextResponse } from "next/server";
import { markNoteDone } from "@/lib/core/desk";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = env().ADMIN_TOKEN;
  if (!token || req.headers.get("x-admin-token") !== token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  await markNoteDone(id);
  return NextResponse.json({ ok: true });
}
