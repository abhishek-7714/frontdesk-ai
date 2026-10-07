import { one } from "../db";
import { emit } from "../events";
import type { SaveIntakeInput } from "../schemas";
import { ensureCall } from "./calls";

export type IntakeFields = {
  chief_complaint: string;
  duration: string | null;
  severity: string | null;
  current_medications: string | null;
  notes: string | null;
};

/** Upsert by call_id, merging non-empty fields, linked to the call's appointment if one exists. */
export async function saveIntake(callId: string, input: SaveIntakeInput) {
  await ensureCall(callId);
  const appt = await one<{ id: number }>(`SELECT id FROM appointments WHERE call_id = $1 AND status = 'booked' ORDER BY id DESC LIMIT 1`, [callId]);
  const row = await one<IntakeFields & { id: number; appointment_id: number | null }>(
    `INSERT INTO intakes (call_id, appointment_id, chief_complaint, duration, severity, current_medications, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (call_id) WHERE call_id IS NOT NULL DO UPDATE SET
       appointment_id = COALESCE(EXCLUDED.appointment_id, intakes.appointment_id),
       chief_complaint = COALESCE(NULLIF(EXCLUDED.chief_complaint, ''), intakes.chief_complaint),
       duration = COALESCE(EXCLUDED.duration, intakes.duration),
       severity = COALESCE(EXCLUDED.severity, intakes.severity),
       current_medications = COALESCE(EXCLUDED.current_medications, intakes.current_medications),
       notes = COALESCE(EXCLUDED.notes, intakes.notes)
     RETURNING id, appointment_id, chief_complaint, duration, severity, current_medications, notes`,
    [callId, appt?.id ?? null, input.chief_complaint, input.duration ?? null, input.severity ?? null, input.current_medications ?? null, input.notes ?? null],
  );
  if (!row) throw new Error("intake upsert returned nothing");
  const fields: IntakeFields = {
    chief_complaint: row.chief_complaint,
    duration: row.duration,
    severity: row.severity,
    current_medications: row.current_medications,
    notes: row.notes,
  };
  await emit(callId, "tool.save_intake", { intake_id: row.id, appointment_id: row.appointment_id, fields });
  return { saved: true, fields };
}
