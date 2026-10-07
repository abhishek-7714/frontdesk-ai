// Markdown renderers for the doctor's view in Claude (MCP tool outputs).
import { getSchedule, type ScheduleItem } from "./core/scheduling";
import { getPatientBrief } from "./core/patients";
import { listRecentCalls } from "./core/calls";
import { searchPolicy } from "./core/policy";
import { longDay, relativeAgo, timeLabel, istDayOf } from "./time";
import type { ScheduleRange } from "./schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

function intakeLine(i: Pick<ScheduleItem, "chief_complaint" | "duration" | "severity" | "current_medications" | "intake_notes">): string | null {
  if (i.intake_notes && !i.duration && !i.severity && !i.current_medications) return i.intake_notes;
  const parts: string[] = [];
  if (i.chief_complaint) parts.push(`${i.chief_complaint}${i.duration ? ` for ${i.duration}` : ""}`);
  if (i.severity) parts.push(i.severity);
  if (i.current_medications) parts.push(/^(none|no)\b/i.test(i.current_medications) ? "no current medicines" : `Medicines: ${i.current_medications}`);
  if (i.intake_notes) parts.push(i.intake_notes);
  if (!parts.length) return null;
  const s = parts.join("; ");
  return s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
}

export async function scheduleMarkdown(opts: { doctor?: string; range?: ScheduleRange } = {}): Promise<string> {
  const now = new Date();
  const { doctor, window, items } = await getSchedule({ ...opts, now });
  const header = `**${doctor.name} · ${doctor.specialty} · ${window.label} (${items.length} appointment${items.length === 1 ? "" : "s"})**`;
  if (!items.length) return `${header}\n\nNo appointments booked ${window.label}.`;

  const byDay = new Map<number, ScheduleItem[]>();
  for (const it of items) {
    const d = istDayOf(it.starts_at);
    byDay.set(d, [...(byDay.get(d) ?? []), it]);
  }
  const fresh = items.filter((i) => i.source === "voice_agent" && now.getTime() - i.created_at.getTime() < DAY_MS);
  const lines: string[] = [header];
  if (fresh.length) {
    lines.push("", `> **New from the AI receptionist (last 24 hours)**`);
    for (const it of fresh) {
      lines.push(`> - ${longDay(it.starts_at)}, ${timeLabel(it.starts_at)} · **${it.patient_name}** · ${it.reason} · booked ${relativeAgo(it.created_at, now)}`);
    }
  }
  for (const [day, list] of byDay) {
    lines.push("", `### ${longDay(day)}`);
    for (const it of list) {
      const isFresh = fresh.includes(it);
      const name = isFresh ? `**${it.patient_name}**` : it.patient_name;
      const tag = isFresh ? ` · *Booked by AI receptionist ${relativeAgo(it.created_at, now)}*` : "";
      lines.push(`- ${timeLabel(it.starts_at)} · ${name} · ${it.reason}${tag}`);
      const intake = intakeLine(it);
      if (intake) lines.push(`  Intake: ${intake}`);
      if (isFresh && it.summary) lines.push(`  Call summary: ${it.summary}`);
    }
  }
  return lines.join("\n");
}

export async function patientBriefMarkdown(patientName: string): Promise<string> {
  const brief = await getPatientBrief(patientName);
  if (!brief) return `No patient matching "${patientName}" was found at Fernleaf Clinic.`;
  const { patient, appointments } = brief;
  const now = new Date();
  const lines = [`**${patient.name}**${patient.phone ? ` · ${patient.phone}` : ""}`];
  const upcoming = appointments.filter((a) => a.starts_at.getTime() >= now.getTime() - 60 * 60_000);
  if (!upcoming.length) {
    lines.push("", "No upcoming appointments.");
    return lines.join("\n");
  }
  for (const a of upcoming) {
    lines.push("", `### ${longDay(a.starts_at)} at ${timeLabel(a.starts_at)} · ${a.doctor_name} (${a.specialty})`);
    lines.push(`- **Reason:** ${a.reason}`);
    lines.push(
      a.source === "voice_agent"
        ? `- **Booked by:** AI receptionist (phone call, ${relativeAgo(a.created_at, now)}${a.call_started_at && a.call_ended_at ? `, ${Math.max(1, Math.round((a.call_ended_at.getTime() - a.call_started_at.getTime()) / 60000))} min call` : ""})`
        : `- **Booked by:** front desk`,
    );
    if (a.chief_complaint || a.intake_notes) {
      lines.push("- **Intake:**");
      if (a.chief_complaint) lines.push(`  - Complaint: ${a.chief_complaint}`);
      if (a.duration) lines.push(`  - Duration: ${a.duration}`);
      if (a.severity) lines.push(`  - Severity: ${a.severity}`);
      if (a.current_medications) lines.push(`  - Current medicines: ${a.current_medications}`);
      if (a.intake_notes) lines.push(`  - Notes: ${a.intake_notes}`);
    }
    if (a.summary) lines.push(`- **Call summary:** ${a.summary}`);
  }
  return lines.join("\n");
}

export async function recentCallsMarkdown(limit = 5): Promise<string> {
  const calls = await listRecentCalls(limit);
  if (!calls.length) return "No calls handled by the AI receptionist yet.";
  const now = new Date();
  const lines = [`**Recent calls handled by the AI receptionist (${calls.length})**`, ""];
  for (const c of calls) {
    const outcome = c.escalated ? `Escalated (${c.escalated})` : c.booked ? "Booked" : c.status === "live" ? "In progress" : "Information only";
    const dur = c.ended_at ? `${Math.max(1, Math.round((c.ended_at.getTime() - c.started_at.getTime()) / 1000))} s` : "live";
    const who = c.patient_name ?? "Unknown caller";
    const booking = c.booked && c.doctor_name && c.starts_at ? ` → ${c.doctor_name}, ${longDay(c.starts_at)} ${timeLabel(c.starts_at)}` : "";
    lines.push(`- **${outcome}** · ${who} · ${relativeAgo(c.started_at, now)} · ${dur}${booking}`);
    if (c.summary) lines.push(`  ${c.summary}`);
  }
  return lines.join("\n");
}

export async function policyMarkdown(q: string): Promise<string> {
  const { matches } = await searchPolicy(q);
  if (!matches.length) return `No clinic policy passages matched "${q}".`;
  return matches.map((m) => `**${m.doc_title} › ${m.section}**\n\n${m.content}`).join("\n\n---\n\n");
}
