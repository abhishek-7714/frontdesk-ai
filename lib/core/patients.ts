import type { PoolClient } from "pg";
import { query } from "../db";

export function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return d.length >= 6 ? raw.trim() : undefined;
}

function titleCase(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Match on phone when given (non-seed patients only), else create. */
export async function findOrCreatePatient(c: PoolClient, name: string, phone?: string): Promise<number> {
  const normalized = normalizePhone(phone);
  if (normalized) {
    const hit = await c.query<{ id: number }>(`SELECT id FROM patients WHERE phone = $1 AND is_seed = false ORDER BY id DESC LIMIT 1`, [normalized]);
    if (hit.rows[0]) {
      await c.query(`UPDATE patients SET name = $1 WHERE id = $2`, [titleCase(name), hit.rows[0].id]);
      return hit.rows[0].id;
    }
  }
  const r = await c.query<{ id: number }>(`INSERT INTO patients (name, phone) VALUES ($1, $2) RETURNING id`, [titleCase(name), normalized ?? null]);
  return r.rows[0].id;
}

export type PatientBrief = {
  patient: { id: number; name: string; phone: string | null; is_seed: boolean };
  appointments: {
    id: number;
    starts_at: Date;
    doctor_name: string;
    specialty: string;
    reason: string;
    source: string;
    created_at: Date;
    chief_complaint: string | null;
    duration: string | null;
    severity: string | null;
    current_medications: string | null;
    intake_notes: string | null;
    summary: string | null;
    call_started_at: Date | null;
    call_ended_at: Date | null;
  }[];
};

function score(name: string, q: string): number {
  const n = name.toLowerCase();
  const qq = q.toLowerCase().trim();
  if (n === qq) return 100;
  let s = 0;
  if (n.includes(qq)) s += 50;
  for (const w of qq.split(/\s+/).filter((x) => x.length > 1)) {
    if (n.split(" ").some((p) => p === w)) s += 20;
    else if (n.split(" ").some((p) => p.startsWith(w) || w.startsWith(p))) s += 10;
    else if (n.includes(w)) s += 5;
  }
  return s;
}

export async function getPatientBrief(patientName: string): Promise<PatientBrief | null> {
  const candidates = await query<{ id: number; name: string; phone: string | null; is_seed: boolean; last: Date | null }>(
    `SELECT p.id, p.name, p.phone, p.is_seed, max(a.created_at) AS last
     FROM patients p LEFT JOIN appointments a ON a.patient_id = p.id AND a.status = 'booked'
     GROUP BY p.id`,
  );
  const ranked = candidates
    .map((c) => ({ c, s: score(c.name, patientName) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(a.c.is_seed) - Number(b.c.is_seed) || (b.c.last?.getTime() ?? 0) - (a.c.last?.getTime() ?? 0));
  const best = ranked[0]?.c;
  if (!best) return null;
  const appointments = await query<PatientBrief["appointments"][number]>(
    `SELECT a.id, s.starts_at, d.name AS doctor_name, d.specialty, a.reason, a.source, a.created_at,
            i.chief_complaint, i.duration, i.severity, i.current_medications, i.notes AS intake_notes,
            c.summary, c.started_at AS call_started_at, c.ended_at AS call_ended_at
     FROM appointments a
     JOIN slots s ON s.id = a.slot_id
     JOIN doctors d ON d.id = a.doctor_id
     LEFT JOIN LATERAL (SELECT * FROM intakes WHERE appointment_id = a.id ORDER BY id DESC LIMIT 1) i ON true
     LEFT JOIN calls c ON c.id = a.call_id
     WHERE a.patient_id = $1 AND a.status = 'booked'
     ORDER BY s.starts_at`,
    [best.id],
  );
  return { patient: { id: best.id, name: best.name, phone: best.phone, is_seed: best.is_seed }, appointments };
}
