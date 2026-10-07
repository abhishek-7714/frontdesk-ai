import { NextResponse } from "next/server";
import { z } from "zod";
import { callIdSchema, toolInputs, type ToolName } from "@/lib/schemas";
import { searchPolicy } from "@/lib/core/policy";
import { bookAppointment, checkAvailability } from "@/lib/core/scheduling";
import { saveIntake } from "@/lib/core/intake";
import { flagForStaff } from "@/lib/core/escalation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every response is 200 with { ok, result } or { ok: false, message } so the agent always has something speakable.
const speakable = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, message, ...extra });

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  const started = Date.now();
  if (!(tool in toolInputs)) return speakable(`Unknown tool ${tool}. Apologise and offer to have the front desk call back.`);
  const name = tool as ToolName;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return speakable("The request was not readable. Apologise briefly and try again.");
  }
  const callId = callIdSchema.safeParse(body.call_id);
  if (!callId.success) return speakable("The call reference is missing. Apologise and offer to have the front desk call back.");
  const { call_id: _ignored, ...args } = body;
  const parsed = toolInputs[name].safeParse(args);
  if (!parsed.success) {
    return speakable(`Some details are missing or unclear (${z.prettifyError(parsed.error).replace(/\n/g, " ")}). Ask the patient to clarify, then try again.`);
  }

  try {
    let payload: Record<string, unknown>;
    switch (name) {
      case "search_policy": {
        const r = await searchPolicy((parsed.data as z.infer<typeof toolInputs.search_policy>).query, { callId: callId.data });
        payload = r.matches.length
          ? { ok: true, result: { matches: r.matches } }
          : { ok: true, result: { matches: [], note: "Nothing relevant found. Tell the caller the front desk will call back, and call flag_for_staff with urgency routine." } };
        break;
      }
      case "check_availability":
        payload = { ok: true, result: await checkAvailability(parsed.data as z.infer<typeof toolInputs.check_availability>, { callId: callId.data }) };
        break;
      case "book_appointment":
        payload = await bookAppointment(callId.data, parsed.data as z.infer<typeof toolInputs.book_appointment>);
        break;
      case "save_intake":
        payload = { ok: true, result: await saveIntake(callId.data, parsed.data as z.infer<typeof toolInputs.save_intake>) };
        break;
      case "flag_for_staff":
        payload = { ok: true, result: await flagForStaff(callId.data, parsed.data as z.infer<typeof toolInputs.flag_for_staff>) };
        break;
    }
    console.log(`[tool] ${name} ${Date.now() - started}ms`);
    return NextResponse.json(payload);
  } catch (err) {
    console.error(`[tool] ${name} failed:`, err instanceof Error ? err.message : err);
    return speakable("Sorry, the clinic system had a problem. Apologise briefly and offer to have the front desk call back.");
  }
}
