import { NextResponse } from "next/server";
import { endCall } from "@/lib/core/calls";
import { callIdSchema, endCallInput } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const callId = callIdSchema.safeParse(id);
  if (!callId.success) return NextResponse.json({ ok: false, error: "invalid call id" }, { status: 400 });
  const body = endCallInput.safeParse((await req.json().catch(() => ({}))) ?? {});
  try {
    const r = await endCall(callId.data, body.success ? body.data.eleven_conversation_id : undefined);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[end] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
