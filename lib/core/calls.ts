import { query, one, tx } from "../db";
import { emit, type CallEvent } from "../events";
import { env } from "../env";
import { generateSummary } from "../llm";
import { istInstant, longDay, timeLabel, today } from "../time";

export async function createCall(): Promise<{ call_id: string }> {
  const row = await one<{ id: string; started_at: Date }>(`INSERT INTO calls DEFAULT VALUES RETURNING id, started_at`);
  if (!row) throw new Error("could not create call");
  await emit(row.id, "call.started", { started_at: row.started_at.toISOString() });
  return { call_id: row.id };
}

/** Tool calls can arrive for a call id the server has not seen (e.g. a retried create); never fail on that. */
export async function ensureCall(callId: string): Promise<void> {
  const inserted = await one<{ id: string; started_at: Date }>(
    `INSERT INTO calls (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id, started_at`,
    [callId],
  );
  if (inserted) await emit(callId, "call.started", { started_at: inserted.started_at.toISOString() });
}

export async function appendTranscript(callId: string, role: "patient" | "agent", text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean === "...") return { skipped: true };
  await ensureCall(callId);
  const row = await one<{ id: string; at: Date }>(`INSERT INTO transcript_lines (call_id, role, text) VALUES ($1,$2,$3) RETURNING id, at`, [callId, role, clean]);
  await emit(callId, "transcript.line", { line_id: Number(row?.id), role, text: clean });
  return { skipped: false };
}

type Outcome = "booked" | "escalated" | "information";

export async function endCall(callId: string, elevenConversationId?: string) {
  await ensureCall(callId);
  // Exactly once: only the request that flips status to 'ended' runs the summary.
  const flipped = await one<{ started_at: Date; ended_at: Date }>(
    `UPDATE calls SET status = 'ended', ended_at = now(), eleven_conversation_id = COALESCE($2, eleven_conversation_id)
     WHERE id = $1 AND status = 'live' RETURNING started_at, ended_at`,
    [callId, elevenConversationId ?? null],
  );
  if (!flipped) {
    const existing = await one<{ summary: string | null }>(`SELECT summary FROM calls WHERE id = $1`, [callId]);
    return { already_ended: true, summary: existing?.summary ?? null };
  }

  const appt = await one<{ id: number; starts_at: Date; doctor_name: string; specialty: string; reason: string; patient_name: string; slot_minutes: number }>(
    `SELECT a.id, s.starts_at, d.name AS doctor_name, d.specialty, a.reason, p.name AS patient_name, d.slot_minutes
     FROM appointments a JOIN slots s ON s.id = a.slot_id JOIN doctors d ON d.id = a.doctor_id JOIN patients p ON p.id = a.patient_id
     WHERE a.call_id = $1 AND a.status = 'booked' ORDER BY a.id DESC LIMIT 1`,
    [callId],
  );
  const intake = await one<{ chief_complaint: string | null; duration: string | null; severity: string | null; current_medications: string | null; notes: string | null }>(
    `SELECT chief_complaint, duration, severity, current_medications, notes FROM intakes WHERE call_id = $1`,
    [callId],
  );
  const escalation = await one<{ reason: string; urgency: string }>(`SELECT reason, urgency FROM escalations WHERE call_id = $1 ORDER BY id DESC LIMIT 1`, [callId]);
  const transcript = await query<{ role: string; text: string }>(
    `SELECT role, text FROM (SELECT id, role, text FROM transcript_lines WHERE call_id = $1 ORDER BY id DESC LIMIT 40) t ORDER BY id`,
    [callId],
  );

  const summary = await generateSummary({
    patient_name: appt?.patient_name ?? null,
    appointment: appt ? { doctor_name: appt.doctor_name, day: longDay(appt.starts_at), time: timeLabel(appt.starts_at), reason: appt.reason } : null,
    intake,
    escalation,
    transcript,
  });
  await query(`UPDATE calls SET summary = $2, summary_input_tokens = $3, summary_output_tokens = $4 WHERE id = $1`, [
    callId,
    summary.text,
    summary.input_tokens,
    summary.output_tokens,
  ]);

  const outcome: Outcome = escalation?.urgency === "emergency" ? "escalated" : appt ? "booked" : escalation ? "escalated" : "information";
  const durationS = Math.max(0, Math.round((flipped.ended_at.getTime() - flipped.started_at.getTime()) / 1000));
  await emit(callId, "call.ended", {
    summary: summary.text,
    summary_source: summary.source,
    duration_s: durationS,
    outcome,
    patient_name: appt?.patient_name ?? null,
    appointment: appt
      ? { doctor_name: appt.doctor_name, specialty: appt.specialty, long_day: longDay(appt.starts_at), time_label: timeLabel(appt.starts_at), reason: appt.reason }
      : null,
  });

  const doctorName = appt?.doctor_name ?? (await one<{ name: string }>(`SELECT name FROM doctors WHERE slug = $1`, [env().DEMO_DOCTOR_SLUG]))?.name ?? "the doctor";
  setTimeout(() => {
    void emit(callId, "handoff.ready", { doctor_name: doctorName });
  }, 600);

  return { already_ended: false, summary: summary.text, outcome, duration_s: durationS };
}

// ---------- Monitor snapshot and stats ----------

export async function getLatestSnapshot(): Promise<{ call: { id: string; status: string; started_at: string; ended_at: string | null } | null; events: CallEvent[] }> {
  const call = await one<{ id: string; status: string; started_at: Date; ended_at: Date | null }>(
    `SELECT id, status, started_at, ended_at FROM calls ORDER BY started_at DESC LIMIT 1`,
  );
  if (!call) return { call: null, events: [] };
  const events = await query<{ id: string; call_id: string; type: CallEvent["type"]; payload: Record<string, unknown>; at: Date }>(
    `SELECT id, call_id, type, payload, at FROM call_events WHERE call_id = $1 ORDER BY id`,
    [call.id],
  );
  return {
    call: { id: call.id, status: call.status, started_at: call.started_at.toISOString(), ended_at: call.ended_at?.toISOString() ?? null },
    events: events.map((e) => ({ ...e, id: Number(e.id), at: e.at.toISOString() })),
  };
}

export async function getTodayStats() {
  const t0 = today();
  const row = await one<{ calls: number; booked: number; avg_s: number | null }>(
    `SELECT count(*)::int AS calls,
            (SELECT count(*)::int FROM appointments WHERE source = 'voice_agent' AND created_at >= $1) AS booked,
            avg(EXTRACT(EPOCH FROM (ended_at - started_at)))::float AS avg_s
     FROM calls WHERE started_at >= $1`,
    [istInstant(t0)],
  );
  const appts = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM appointments a JOIN slots s ON s.id = a.slot_id WHERE a.status = 'booked' AND s.starts_at >= $1 AND s.starts_at < $2`,
    [istInstant(t0), istInstant(t0 + 1)],
  );
  return { calls_today: row?.calls ?? 0, booked_by_ai: row?.booked ?? 0, avg_call_s: row?.avg_s ? Math.round(row.avg_s) : null, appointments_today: appts?.n ?? 0 };
}

export async function listRecentCalls(limit = 5) {
  return query<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
    status: string;
    summary: string | null;
    patient_name: string | null;
    booked: boolean;
    escalated: string | null;
    doctor_name: string | null;
    starts_at: Date | null;
  }>(
    `SELECT c.id, c.started_at, c.ended_at, c.status, c.summary, p.name AS patient_name,
            (a.id IS NOT NULL) AS booked, e.urgency AS escalated, d.name AS doctor_name, s.starts_at
     FROM calls c
     LEFT JOIN patients p ON p.id = c.patient_id
     LEFT JOIN LATERAL (SELECT * FROM appointments WHERE call_id = c.id AND status = 'booked' ORDER BY id DESC LIMIT 1) a ON true
     LEFT JOIN slots s ON s.id = a.slot_id
     LEFT JOIN doctors d ON d.id = a.doctor_id
     LEFT JOIN LATERAL (SELECT urgency FROM escalations WHERE call_id = c.id ORDER BY id DESC LIMIT 1) e ON true
     ORDER BY c.started_at DESC LIMIT $1`,
    [limit],
  );
}

// ---------- Demo reset ----------

export async function resetDemo() {
  const counts = await tx(async (c) => {
    const appts = await c.query<{ id: number; slot_id: number; patient_id: number }>(`SELECT id, slot_id, patient_id FROM appointments WHERE source = 'voice_agent'`);
    const apptIds = appts.rows.map((r) => r.id);
    const slotIds = appts.rows.map((r) => r.slot_id);
    await c.query(`DELETE FROM intakes WHERE call_id IS NOT NULL OR appointment_id = ANY($1::int[])`, [apptIds]);
    await c.query(`DELETE FROM escalations`);
    await c.query(`DELETE FROM appointments WHERE id = ANY($1::int[])`, [apptIds]);
    await c.query(`UPDATE slots SET status = 'open' WHERE id = ANY($1::int[]) AND starts_at > now()`, [slotIds]);
    await c.query(`UPDATE slots SET status = 'blocked' WHERE id = ANY($1::int[]) AND starts_at <= now()`, [slotIds]);
    const calls = await c.query(`DELETE FROM calls`);
    const patients = await c.query(`DELETE FROM patients WHERE is_seed = false AND id NOT IN (SELECT patient_id FROM appointments)`);
    return { appointments: apptIds.length, calls: calls.rowCount ?? 0, patients: patients.rowCount ?? 0 };
  });
  await emit("00000000-0000-0000-0000-000000000000", "demo.reset", {});
  return counts;
}
