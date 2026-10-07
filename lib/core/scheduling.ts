import type { PoolClient } from "pg";
import { query, one, tx } from "../db";
import { emit } from "../events";
import { env } from "../env";
import type { BookAppointmentInput, CheckAvailabilityInput, ScheduleRange } from "../schemas";
import { dayLabel, hourOf, istInstant, longDay, spoken, spokenDay, time12, timeLabel, today, weekday, WEEKDAYS, type IstDay } from "../time";
import { findOrCreatePatient } from "./patients";
import { ensureCall } from "./calls";

// ---------- Specialty mapping (one table) ----------

export const SPECIALTY_KEYWORDS: { specialty: string; words: RegExp }[] = [
  { specialty: "Orthopaedics", words: /ortho|bone|knee|joint|back|spine|shoulder|ankle|wrist|elbow|hip|neck|sport|fracture|sprain|ligament|acl|arthritis|heel|muscle/i },
  { specialty: "Cardiology", words: /cardi|heart|blood pressure|\bbp\b|hypertension|palpitation|chest|cholesterol/i },
  { specialty: "General Medicine", words: /general|family|fever|cold|cough|gp\b|physician|medicine|check.?up|vaccin|diabet|thyroid|infection/i },
];

export function resolveSpecialty(text?: string): string {
  if (!text) return "General Medicine";
  for (const s of SPECIALTY_KEYWORDS) if (s.words.test(text)) return s.specialty;
  return "General Medicine";
}

export type Doctor = { id: number; slug: string; name: string; specialty: string; consult_fee_inr: number; slot_minutes: number };

export async function findDoctor(opts: { doctor?: string; specialty?: string }): Promise<Doctor | null> {
  const doctors = await query<Doctor>(`SELECT id, slug, name, specialty, consult_fee_inr, slot_minutes FROM doctors ORDER BY id`);
  if (opts.doctor) {
    const q = opts.doctor.toLowerCase().replace(/^dr\.?\s*/, "").trim();
    const hit = doctors.find((d) => d.slug === q || d.name.toLowerCase().includes(q) || q.split(/\s+/).some((w) => w.length > 2 && d.name.toLowerCase().includes(w)));
    if (hit) return hit;
  }
  if (opts.specialty || opts.doctor) {
    const spec = resolveSpecialty(opts.specialty ?? opts.doctor);
    return doctors.find((d) => d.specialty === spec) ?? null;
  }
  return null;
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ---------- Day preference (server resolves dates; the LLM never produces ISO dates) ----------

export type DayRange = { from: IstDay; to: IstDay; label: string; time?: "morning" | "afternoon" | "evening" };

const WEEKDAY_RE = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i;

export function resolveDayPreference(phrase: string | undefined, now: Date = new Date()): DayRange {
  const t0 = today(now);
  const p = (phrase ?? "").toLowerCase().trim();
  const time = /morning|\bam\b/.test(p) ? "morning" : /evening|\bpm\b|night/.test(p) ? "evening" : /afternoon/.test(p) ? "afternoon" : undefined;
  const r = (from: IstDay, to: IstDay, label: string): DayRange => ({ from, to, label, time });
  const wd = weekday(t0);

  if (!p || /\b(any|anytime|whenever|soon|earliest|asap|first available|next available)\b/.test(p)) return r(t0, t0 + 7, "the next 7 days");
  if (/day after tomorrow/.test(p)) return r(t0 + 2, t0 + 2, longDay(t0 + 2));
  if (/\btoday\b|\btonight\b|this (morning|evening|afternoon)/.test(p)) return r(t0, t0, "today");
  if (/\btomorrow\b/.test(p)) return r(t0 + 1, t0 + 1, "tomorrow");
  if (/next week/.test(p)) {
    const nextMon = t0 + ((8 - wd) % 7 || 7);
    return r(nextMon, nextMon + 5, "next week");
  }
  if (/weekend/.test(p)) {
    const sat = t0 + ((6 - wd + 7) % 7);
    return r(sat, sat, longDay(sat));
  }
  const m = p.match(WEEKDAY_RE);
  if (m) {
    const target = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(m[1].slice(0, 3));
    let delta = (target - wd + 7) % 7;
    if (/next\s+\w*day/.test(p) && delta === 0) delta = 7;
    const d = t0 + delta;
    // "Thursday" on a Thursday evening after the last slot: the range check below handles it via open slots.
    return r(d, d, longDay(d));
  }
  const dom = p.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  if (dom) {
    const n = Number(dom[1]);
    for (let d = t0; d <= t0 + 31; d++) {
      if (Number(new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Asia/Kolkata" }).format(istInstant(d, 12))) === n) return r(d, d, longDay(d));
    }
  }
  if (/this week|week|few days|coming days/.test(p)) {
    const sat = t0 + ((6 - wd + 7) % 7);
    return r(t0, wd === 0 ? t0 + 6 : sat, "this week");
  }
  return r(t0, t0 + 7, "the next 7 days");
}

function matchesTime(d: Date, pref?: string): boolean {
  if (!pref || pref === "any") return true;
  const h = hourOf(d);
  if (pref === "morning") return h < 13;
  return h >= 13; // afternoon / evening → the 16:00–19:00 session
}

// ---------- check_availability ----------

type SlotRow = { id: number; starts_at: Date };

function spreadPick(rows: SlotRow[], n: number): SlotRow[] {
  const seen = new Set<number>();
  const picked: SlotRow[] = [];
  for (const s of rows) {
    const day = Math.floor((s.starts_at.getTime() + 330 * 60_000) / 86_400_000);
    if (!seen.has(day)) {
      seen.add(day);
      picked.push(s);
    }
    if (picked.length === n) break;
  }
  for (const s of rows) {
    if (picked.length >= n) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
}

async function openSlots(doctorId: number, from: Date, to: Date): Promise<SlotRow[]> {
  return query<SlotRow>(
    `SELECT id, starts_at FROM slots
     WHERE doctor_id = $1 AND status = 'open' AND starts_at > now() + interval '30 minutes'
       AND starts_at >= $2 AND starts_at < $3
     ORDER BY starts_at LIMIT 60`,
    [doctorId, from, to],
  );
}

export async function checkAvailability(input: CheckAvailabilityInput, opts: { callId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const doctor =
    (await findDoctor({ doctor: input.doctor_name, specialty: input.specialty })) ??
    (await findDoctor({ specialty: "General Medicine" }));
  if (!doctor) throw new Error("No doctors configured");

  const range = resolveDayPreference(input.day_preference, now);
  const timePref = input.time_preference && input.time_preference !== "any" ? input.time_preference : range.time;
  let rows = (await openSlots(doctor.id, istInstant(range.from), istInstant(range.to + 1))).filter((s) => matchesTime(s.starts_at, timePref));
  let note: string | undefined;
  if (rows.length === 0) {
    rows = (await openSlots(doctor.id, now, istInstant(today(now) + 8))).filter((s) => matchesTime(s.starts_at, timePref));
    if (rows.length === 0) rows = await openSlots(doctor.id, now, istInstant(today(now) + 8));
    note = `Nothing open ${range.label === "today" ? "today" : `for ${range.label}`}; these are the nearest options.`;
  }
  const picked = spreadPick(rows, 3);

  const result = {
    today: longDay(today(now)),
    doctor: { name: doctor.name, specialty: doctor.specialty, fee_inr: doctor.consult_fee_inr },
    slots: picked.map((s) => ({ slot_id: s.id, spoken: spoken(s.starts_at, now) })),
    ...(note ? { note } : {}),
    ...(picked.length === 0 ? { note: "No open slots in the next week. Offer to have the front desk call back." } : {}),
  };

  if (opts.callId) {
    await emit(opts.callId, "tool.check_availability", {
      doctor: { name: doctor.name, specialty: doctor.specialty, fee_inr: doctor.consult_fee_inr, initials: initials(doctor.name) },
      day_preference: input.day_preference ?? null,
      slots: picked.map((s) => ({ slot_id: s.id, day_label: dayLabel(s.starts_at), time_label: timeLabel(s.starts_at), spoken: spoken(s.starts_at, now) })),
    });
  }
  return result;
}

// ---------- book_appointment ----------

type BookResult =
  | { ok: true; result: { appointment_id: number; confirmation: string } }
  | { ok: false; message: string; alternatives?: { slot_id: number; spoken: string }[] };

export async function bookAppointment(callId: string, input: BookAppointmentInput): Promise<BookResult> {
  await ensureCall(callId);

  type Booked = { appointment_id: number; doctor: Doctor; starts_at: Date; patient_name: string; created: boolean };
  const outcome = await tx<Booked | { taken: true; doctor_id: number } | { missing: true }>(async (c: PoolClient) => {
    // Idempotent per (call_id, slot_id).
    const existing = await c.query<{ id: number }>(`SELECT id FROM appointments WHERE call_id = $1 AND slot_id = $2 AND status = 'booked'`, [callId, input.slot_id]);
    const slot = await c.query<{ id: number; doctor_id: number; starts_at: Date; status: string }>(
      `SELECT id, doctor_id, starts_at, status FROM slots WHERE id = $1 FOR UPDATE`,
      [input.slot_id],
    );
    if (!slot.rows[0]) return { missing: true as const };
    const s = slot.rows[0];
    const doctor = (await c.query<Doctor>(`SELECT id, slug, name, specialty, consult_fee_inr, slot_minutes FROM doctors WHERE id = $1`, [s.doctor_id])).rows[0];
    if (existing.rows[0]) {
      const p = await c.query<{ name: string }>(`SELECT p.name FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`, [existing.rows[0].id]);
      return { appointment_id: existing.rows[0].id, doctor, starts_at: s.starts_at, patient_name: p.rows[0]?.name ?? input.patient_name, created: false };
    }
    if (s.status !== "open" || s.starts_at.getTime() < Date.now()) return { taken: true as const, doctor_id: s.doctor_id };

    const patientId = await findOrCreatePatient(c, input.patient_name, input.patient_phone);
    const a = await c.query<{ id: number }>(
      `INSERT INTO appointments (slot_id, doctor_id, patient_id, reason, source, call_id) VALUES ($1,$2,$3,$4,'voice_agent',$5) RETURNING id`,
      [s.id, s.doctor_id, patientId, input.reason, callId],
    );
    await c.query(`UPDATE slots SET status = 'booked' WHERE id = $1`, [s.id]);
    await c.query(`UPDATE calls SET patient_id = $1 WHERE id = $2`, [patientId, callId]);
    // Link an intake captured before booking, if any.
    await c.query(`UPDATE intakes SET appointment_id = $1 WHERE call_id = $2 AND appointment_id IS NULL`, [a.rows[0].id, callId]);
    return { appointment_id: a.rows[0].id, doctor, starts_at: s.starts_at, patient_name: input.patient_name, created: true };
  });

  if ("missing" in outcome) {
    return { ok: false, message: "I could not find that time slot. Please check availability again and offer the patient one of the new options." };
  }
  if ("taken" in outcome) {
    const alts = (await openSlots(outcome.doctor_id, new Date(), istInstant(today() + 8))).slice(0, 2);
    return {
      ok: false,
      message: "That slot was just taken. Please offer another time.",
      alternatives: alts.map((s) => ({ slot_id: s.id, spoken: spoken(s.starts_at) })),
    };
  }

  const { doctor, starts_at } = outcome;
  const confirmation = `Booked with ${doctor.name} on ${spokenDay(starts_at)} at ${time12(starts_at).replace(":00 ", " ")}. Consultation fee is ${doctor.consult_fee_inr} rupees.`;
  if (outcome.created) {
    await emit(callId, "tool.book_appointment", {
      appointment_id: outcome.appointment_id,
      doctor: { name: doctor.name, specialty: doctor.specialty, initials: initials(doctor.name) },
      patient_name: outcome.patient_name,
      reason: input.reason,
      day_label: dayLabel(starts_at),
      long_day: longDay(starts_at),
      time_label: timeLabel(starts_at),
      fee_inr: doctor.consult_fee_inr,
      duration_min: doctor.slot_minutes,
    });
  }
  return { ok: true, result: { appointment_id: outcome.appointment_id, confirmation } };
}

// ---------- get_schedule (doctor's view) ----------

export type ScheduleItem = {
  appointment_id: number;
  starts_at: Date;
  patient_name: string;
  reason: string;
  source: "voice_agent" | "seed";
  created_at: Date;
  chief_complaint: string | null;
  duration: string | null;
  severity: string | null;
  current_medications: string | null;
  intake_notes: string | null;
  summary: string | null;
  needs_reschedule: boolean;
};

export function scheduleWindow(range: ScheduleRange = "next_7_days", now: Date = new Date()): { from: IstDay; to: IstDay; label: string } {
  const t0 = today(now);
  const wd = weekday(t0);
  switch (range) {
    case "today":
      return { from: t0, to: t0, label: "today" };
    case "tomorrow":
      return { from: t0 + 1, to: t0 + 1, label: "tomorrow" };
    case "this_week":
      return { from: t0, to: wd === 0 ? t0 + 6 : t0 + (6 - wd), label: "this week" };
    default:
      return { from: t0, to: t0 + 6, label: "next 7 days" };
  }
}

export async function getSchedule(opts: { doctor?: string; range?: ScheduleRange; now?: Date } = {}) {
  const doctor = (await findDoctor({ doctor: opts.doctor ?? env().DEMO_DOCTOR_SLUG })) ?? (await findDoctor({ doctor: env().DEMO_DOCTOR_SLUG }));
  if (!doctor) throw new Error("Doctor not found");
  const win = scheduleWindow(opts.range, opts.now);
  const items = await query<ScheduleItem>(
    `SELECT a.id AS appointment_id, s.starts_at, p.name AS patient_name, a.reason, a.source, a.created_at,
            i.chief_complaint, i.duration, i.severity, i.current_medications, i.notes AS intake_notes, c.summary, a.needs_reschedule
     FROM appointments a
     JOIN slots s ON s.id = a.slot_id
     JOIN patients p ON p.id = a.patient_id
     LEFT JOIN LATERAL (SELECT * FROM intakes WHERE appointment_id = a.id ORDER BY id DESC LIMIT 1) i ON true
     LEFT JOIN calls c ON c.id = a.call_id
     WHERE a.doctor_id = $1 AND a.status = 'booked' AND s.starts_at >= $2 AND s.starts_at < $3
     ORDER BY s.starts_at`,
    [doctor.id, istInstant(win.from), istInstant(win.to + 1)],
  );
  return { doctor, window: win, items };
}

export { WEEKDAYS };
