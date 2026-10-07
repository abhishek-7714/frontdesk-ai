// Markdown renderers for the doctor's view in Claude (MCP tool outputs).
import { getSchedule, type ScheduleItem } from "./core/scheduling";
import { getPatientBrief } from "./core/patients";
import { blockDay, blockedDays, notifyFrontDesk, reopenDay } from "./core/desk";
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
  const blocked = new Map((await blockedDays(doctor.id, window.from, window.to)).map((b) => [b.day, b.reason]));
  const header = `**${doctor.name} · ${doctor.specialty} · ${window.label} (${items.length} appointment${items.length === 1 ? "" : "s"})**`;
  if (!items.length && !blocked.size) return `${header}\n\nNo appointments booked ${window.label}.`;

  const byDay = new Map<number, ScheduleItem[]>();
  for (const d of [...blocked.keys()].sort((a, b) => a - b)) byDay.set(d, []);
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
  for (const [day, list] of [...byDay].sort((a, b) => a[0] - b[0])) {
    if (blocked.has(day)) {
      const reason = blocked.get(day);
      const pending = list.filter((i) => i.needs_reschedule).length;
      lines.push("", `### ${longDay(day)} · Blocked${reason ? ` (${reason})` : ""}`);
      lines.push(`*No new bookings this day. ${pending ? `${pending} patient${pending === 1 ? "" : "s"} flagged for the front desk to reschedule.` : "No patients to move."}*`);
    } else {
      lines.push("", `### ${longDay(day)}`);
    }
    for (const it of list) {
      const isFresh = fresh.includes(it);
      const name = isFresh ? `**${it.patient_name}**` : it.patient_name;
      const tag =
        (isFresh ? ` · *Booked by AI receptionist ${relativeAgo(it.created_at, now)}*` : "") + (it.needs_reschedule ? " · ⚠️ *Needs rescheduling*" : "");
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
    const booking = c.booked && c.doctor_name && c.starts_at ? ` → ${c.doctor_name}, ${longDay(c.starts_at)} at ${timeLabel(c.starts_at)}` : "";
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

export async function blockDayMarkdown(input: { day: string; doctor?: string; reason?: string }): Promise<string> {
  const r = await blockDay(input);
  if (!r.ok) return r.message;
  const lines = [
    `**${longDay(r.day)} is blocked for ${r.doctor.name}.**`,
    "",
    `- ${r.slots_closed} open slot${r.slots_closed === 1 ? "" : "s"} closed. The AI receptionist will not offer this day.`,
    `- The front desk has been alerted on the monitor.`,
  ];
  if (r.patients.length) {
    lines.push(`- ${r.patients.length} booked patient${r.patients.length === 1 ? " is" : "s are"} flagged for the front desk to reschedule. Nobody has been cancelled or contacted yet:`, "");
    for (const p of r.patients) lines.push(`  - ${p.time_label} · ${p.patient_name}${p.phone ? ` · ${p.phone}` : ""} · ${p.reason}`);
  } else {
    lines.push("- No patients were booked that day.");
  }
  lines.push("", `To undo, use reopen_day for ${longDay(r.day)}.`);
  return lines.join("\n");
}

export async function reopenDayMarkdown(input: { day: string; doctor?: string }): Promise<string> {
  const r = await reopenDay(input);
  if (!r.ok) return r.message;
  return `**${longDay(r.day)} is open again for ${r.doctor.name}.** ${r.slots_reopened} slot${r.slots_reopened === 1 ? "" : "s"} reopened for booking, the reschedule flags are cleared, and the front desk has been told.`;
}

export async function notifyFrontDeskMarkdown(input: { message: string; urgency?: "routine" | "urgent"; doctor?: string }): Promise<string> {
  const r = await notifyFrontDesk(input);
  return `Sent to the front desk from ${r.doctor.name}${input.urgency === "urgent" ? " (marked urgent)" : ""}. It is showing on the front-desk monitor now:\n\n> ${input.message.trim()}`;
}
