// Doctor-side actions from Claude (MCP): block a day, reopen it, leave the front desk a note.
// Nothing here contacts patients or cancels appointments; the front desk does that.
import { query, tx } from "../db";
import { emit } from "../events";
import { env } from "../env";
import { dayFromIso, isoDate, istInstant, longDay, timeLabel, today, type IstDay } from "../time";
import { findDoctor, resolveDayPreference, type Doctor } from "./scheduling";

const NO_CALL = "00000000-0000-0000-0000-000000000000";

export type ReschedulePatient = { appointment_id: number; time_label: string; patient_name: string; phone: string | null; reason: string };

export type DeskNote = {
  id: number;
  kind: "note" | "day_blocked" | "day_reopened";
  message: string;
  urgency: "routine" | "urgent";
  doctor_name: string | null;
  details: { day?: string; day_label?: string; slots_closed?: number; patients?: ReschedulePatient[] };
  created_at: string;
};

async function doctorOrDefault(name?: string): Promise<Doctor> {
  const d = (name ? await findDoctor({ doctor: name }) : null) ?? (await findDoctor({ doctor: env().DEMO_DOCTOR_SLUG }));
  if (!d) throw new Error("Doctor not found");
  return d;
}

/** One calendar day from the doctor's words ("Saturday", "10th", "tomorrow"). Ranges like "next week" are refused. */
function resolveOneDay(phrase: string, now = new Date()): { day: IstDay } | { error: string } {
  const r = resolveDayPreference(phrase, now);
  if (r.from !== r.to) return { error: `"${phrase}" covers more than one day. Name a single day, for example "Saturday" or "the 10th".` };
  if (r.from < today(now)) return { error: `${longDay(r.from)} is in the past.` };
  return { day: r.from };
}

export async function blockDay(input: { day: string; doctor?: string; reason?: string }) {
  const doctor = await doctorOrDefault(input.doctor);
  const resolved = resolveOneDay(input.day);
  if ("error" in resolved) return { ok: false as const, message: resolved.error };
  const { day } = resolved;
  const from = istInstant(day);
  const to = istInstant(day + 1);

  const result = await tx(async (c) => {
    // Close every open slot that day (the voice agent only ever offers 'open' slots, and booking re-checks under a row lock).
    const closed = await c.query<{ id: number }>(
      `UPDATE slots SET status = 'blocked' WHERE doctor_id = $1 AND status = 'open' AND starts_at >= $2 AND starts_at < $3 RETURNING id`,
      [doctor.id, from, to],
    );
    await c.query(
      `INSERT INTO day_blocks (doctor_id, day, reason, slot_ids) VALUES ($1, $2, $3, $4)
       ON CONFLICT (doctor_id, day) DO UPDATE SET reason = COALESCE(EXCLUDED.reason, day_blocks.reason),
         slot_ids = (SELECT array_agg(DISTINCT x) FROM unnest(day_blocks.slot_ids || EXCLUDED.slot_ids) x)`,
      [doctor.id, isoDate(day), input.reason ?? null, closed.rows.map((r) => r.id)],
    );
    // Booked patients stay booked until the front desk moves them; flag them so nobody is missed.
    const flagged = await c.query<{ appointment_id: number; starts_at: Date; patient_name: string; phone: string | null; reason: string }>(
      `UPDATE appointments a SET needs_reschedule = true
       FROM slots s, patients p
       WHERE s.id = a.slot_id AND p.id = a.patient_id AND a.doctor_id = $1 AND a.status = 'booked' AND s.starts_at >= $2 AND s.starts_at < $3
       RETURNING a.id AS appointment_id, s.starts_at, p.name AS patient_name, p.phone, a.reason`,
      [doctor.id, from, to],
    );
    const patients: ReschedulePatient[] = flagged.rows
      .sort((x, y) => x.starts_at.getTime() - y.starts_at.getTime())
      .map((r) => ({ appointment_id: r.appointment_id, time_label: timeLabel(r.starts_at), patient_name: r.patient_name, phone: r.phone, reason: r.reason }));
    const message = `${doctor.name} is unavailable on ${longDay(day)}${input.reason ? ` (${input.reason})` : ""}. Please reschedule ${patients.length} patient${patients.length === 1 ? "" : "s"}.`;
    // Replace any earlier open notice for the same day, so repeated calls don't stack.
    await c.query(`UPDATE desk_notes SET status = 'done' WHERE kind = 'day_blocked' AND status = 'open' AND doctor_id = $1 AND details->>'day' = $2`, [doctor.id, isoDate(day)]);
    await c.query(`INSERT INTO desk_notes (doctor_id, kind, message, urgency, details) VALUES ($1, 'day_blocked', $2, 'urgent', $3)`, [
      doctor.id,
      message,
      JSON.stringify({ day: isoDate(day), day_label: longDay(day), slots_closed: closed.rowCount ?? 0, patients }),
    ]);
    return { slots_closed: closed.rowCount ?? 0, patients };
  });

  await emit(NO_CALL, "desk.updated", {});
  return { ok: true as const, doctor, day, ...result };
}

export async function reopenDay(input: { day: string; doctor?: string }) {
  const doctor = await doctorOrDefault(input.doctor);
  const resolved = resolveOneDay(input.day);
  if ("error" in resolved) return { ok: false as const, message: resolved.error };
  const { day } = resolved;

  const result = await tx(async (c) => {
    const block = await c.query<{ slot_ids: number[] }>(`DELETE FROM day_blocks WHERE doctor_id = $1 AND day = $2 RETURNING slot_ids`, [doctor.id, isoDate(day)]);
    if (!block.rows[0]) return null;
    const reopened = await c.query(
      `UPDATE slots SET status = 'open' WHERE id = ANY($1::int[]) AND status = 'blocked' AND starts_at > now() AND id NOT IN (SELECT slot_id FROM appointments WHERE status = 'booked')`,
      [block.rows[0].slot_ids],
    );
    await c.query(
      `UPDATE appointments a SET needs_reschedule = false FROM slots s
       WHERE s.id = a.slot_id AND a.doctor_id = $1 AND s.starts_at >= $2 AND s.starts_at < $3`,
      [doctor.id, istInstant(day), istInstant(day + 1)],
    );
    await c.query(`UPDATE desk_notes SET status = 'done' WHERE kind = 'day_blocked' AND status = 'open' AND doctor_id = $1 AND details->>'day' = $2`, [doctor.id, isoDate(day)]);
    await c.query(`INSERT INTO desk_notes (doctor_id, kind, message, details) VALUES ($1, 'day_reopened', $2, $3)`, [
      doctor.id,
      `${doctor.name} is available again on ${longDay(day)}. Booked patients keep their times.`,
      JSON.stringify({ day: isoDate(day), day_label: longDay(day) }),
    ]);
    return { slots_reopened: reopened.rowCount ?? 0 };
  });

  if (!result) return { ok: false as const, message: `${longDay(day)} was not blocked for ${doctor.name}.` };
  await emit(NO_CALL, "desk.updated", {});
  return { ok: true as const, doctor, day, ...result };
}

export async function notifyFrontDesk(input: { message: string; urgency?: "routine" | "urgent"; doctor?: string }) {
  const doctor = await doctorOrDefault(input.doctor);
  await query(`INSERT INTO desk_notes (doctor_id, kind, message, urgency) VALUES ($1, 'note', $2, $3)`, [doctor.id, input.message.trim(), input.urgency ?? "routine"]);
  await emit(NO_CALL, "desk.updated", {});
  return { doctor };
}

export async function openDeskNotes(limit = 5): Promise<DeskNote[]> {
  const rows = await query<Omit<DeskNote, "created_at"> & { created_at: Date }>(
    `SELECT n.id, n.kind, n.message, n.urgency, d.name AS doctor_name, n.details, n.created_at
     FROM desk_notes n LEFT JOIN doctors d ON d.id = n.doctor_id
     WHERE n.status = 'open' ORDER BY n.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}

export async function markNoteDone(id: number) {
  await query(`UPDATE desk_notes SET status = 'done' WHERE id = $1`, [id]);
  await emit(NO_CALL, "desk.updated", {});
}

/** Blocked days in a window, for the doctor's schedule view. */
export async function blockedDays(doctorId: number, from: IstDay, to: IstDay) {
  const rows = await query<{ day: string; reason: string | null }>(
    `SELECT day::text AS day, reason FROM day_blocks WHERE doctor_id = $1 AND day >= $2 AND day <= $3 ORDER BY day`,
    [doctorId, isoDate(from), isoDate(to)],
  );
  return rows.map((r) => ({ day: dayFromIso(r.day), reason: r.reason }));
}
