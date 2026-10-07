import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

export const SUMMARY_MODEL = "claude-haiku-4-5";
const SYSTEM = "You write concise pre-visit briefs for doctors. Administrative facts and the patient's own words only. No diagnosis, no advice.";

export type SummaryInput = {
  patient_name: string | null;
  appointment: { doctor_name: string; day: string; time: string; reason: string } | null;
  intake: { chief_complaint: string | null; duration: string | null; severity: string | null; current_medications: string | null; notes: string | null } | null;
  escalation: { reason: string; urgency: string } | null;
  transcript: { role: string; text: string }[];
};

export type Summary = { text: string; input_tokens: number | null; output_tokens: number | null; source: "llm" | "template" };

let client: Anthropic | null = null;

export function templateSummary(s: SummaryInput): string {
  const name = s.patient_name ?? "The caller";
  if (s.appointment) {
    const i = s.intake;
    const parts = [`${name}, booked for ${s.appointment.day} ${s.appointment.time} with ${s.appointment.doctor_name}.`];
    if (i?.chief_complaint) {
      parts.push(`Reports ${lowerFirst(i.chief_complaint)}${i.duration ? ` for ${i.duration}` : ""}${i.severity ? `; ${i.severity}` : ""}.`);
    } else {
      parts.push(`Reason: ${lowerFirst(s.appointment.reason)}.`);
    }
    parts.push(`Current medicines: ${i?.current_medications || "none reported"}.`);
    return parts.join(" ");
  }
  if (s.escalation) return `${name} was escalated to staff (${s.escalation.urgency}): ${s.escalation.reason}.`;
  const asked = s.transcript.filter((l) => l.role === "patient").slice(0, 2).map((l) => l.text).join(" ");
  return asked ? `Information-only call. The caller asked: "${truncate(asked, 160)}"` : "Short call with no booking.";
}

export async function generateSummary(s: SummaryInput): Promise<Summary> {
  const fallback: Summary = { text: templateSummary(s), input_tokens: null, output_tokens: null, source: "template" };
  const key = env().ANTHROPIC_API_KEY;
  if (!key) return fallback;
  if (!client) client = new Anthropic({ apiKey: key, timeout: 8_000, maxRetries: 1 });
  const facts = {
    patient: s.patient_name,
    appointment: s.appointment,
    intake: s.intake,
    escalation: s.escalation,
    transcript: s.transcript.slice(-40).map((l) => `${l.role === "patient" ? "Patient" : "Receptionist"}: ${l.text}`).join("\n"),
  };
  try {
    const res = await client.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 200,
      temperature: 0.2,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Write a two-to-three-sentence pre-visit brief for the doctor from this call. Plain prose, no headings.\n\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });
    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join(" ")
      .trim();
    if (!text) return fallback;
    return { text, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, source: "llm" };
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error(`[llm] summary failed (${err.status}): ${err.message}`);
    else console.error("[llm] summary failed:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}
function truncate(s: string, n: number) {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
