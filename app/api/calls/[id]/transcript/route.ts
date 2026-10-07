import { NextResponse } from "next/server";
import { appendTranscript } from "@/lib/core/calls";
import { callIdSchema, transcriptInput } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const callId = callIdSchema.safeParse(id);
  const body = transcriptInput.safeParse(await req.json().catch(() => null));
  if (!callId.success || !body.success) return NextResponse.json({ ok: false, error: "invalid input" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await appendTranscript(callId.data, body.data.role, body.data.text)) });
  } catch (err) {
    console.error("[transcript] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
