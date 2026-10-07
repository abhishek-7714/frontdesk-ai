import "./load-env";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db";
import { embed, toVectorLiteral } from "../lib/embeddings";
import { istInstant, today, weekday, longDay } from "../lib/time";

// Deterministic RNG (mulberry32, seed 42) so every rehearsal starts from the same state.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const DOCTORS = [
  { slug: "meera-iyer", name: "Dr. Meera Iyer", specialty: "Orthopaedics", fee: 900, bio: "Joint, knee and sports injuries; 14 years of practice" },
  { slug: "arjun-rao", name: "Dr. Arjun Rao", specialty: "Cardiology", fee: 1200, bio: "Preventive cardiology and hypertension care" },
  { slug: "kavya-menon", name: "Dr. Kavya Menon", specialty: "General Medicine", fee: 600, bio: "Family medicine, fevers, routine check-ups" },
];

const PATIENT_NAMES = [
  "Ramesh Kulkarni", "Priya Sharma", "Anil Reddy", "Sunita Rao", "Vikram Desai", "Lakshmi Narayanan", "Rahul Verma",
  "Deepa Pillai", "Suresh Babu", "Kavitha Krishnan", "Arvind Joshi", "Meenakshi Sundaram", "Imran Qureshi", "Neha Gupta",
  "Sandeep Patil", "Farah Khan", "Gopal Chary", "Ananya Bose", "Harish Naidu", "Revathi Subramanian", "Karthik Raman",
  "Shabana Begum", "Venkat Rao", "Pooja Agarwal", "Manoj Tiwari", "Divya Menon", "Rohit Bhat", "Swathi Goud",
  "Nikhil Saxena", "Aparna Iyengar",
];

type Seeded = { reason: string; intake: string };
const REASONS: Record<string, Seeded[]> = {
  Orthopaedics: [
    { reason: "Lower back pain follow-up", intake: "Pain improved since last visit, still stiff in the mornings." },
    { reason: "Post-ACL-surgery follow-up", intake: "Six weeks after surgery; doing physiotherapy, mild swelling after exercise." },
    { reason: "Shoulder stiffness", intake: "Right shoulder stiff for a month, hard to lift arm overhead." },
    { reason: "Ankle sprain review", intake: "Twisted left ankle playing badminton ten days ago, swelling reduced." },
    { reason: "Wrist fracture follow-up", intake: "Cast removed last week; wrist weak, bringing latest X-ray." },
    { reason: "Neck pain", intake: "Neck pain for three weeks, worse after long hours at the laptop." },
    { reason: "Knee arthritis review", intake: "Both knees ache in the mornings; taking calcium supplements." },
    { reason: "Tennis elbow", intake: "Pain on the outer elbow for two weeks, worse when gripping." },
    { reason: "Heel pain", intake: "Sharp heel pain with the first steps in the morning for a month." },
  ],
  Cardiology: [
    { reason: "Blood pressure review", intake: "Home BP readings around 145/95; bringing two-week log." },
    { reason: "Cholesterol follow-up", intake: "Recent lipid profile high; on diet changes for two months." },
    { reason: "Palpitations", intake: "Occasional fluttering in the chest in the evenings, no fainting." },
    { reason: "Annual heart check-up", intake: "Family history of heart disease; no current symptoms." },
    { reason: "Post-angioplasty review", intake: "Angioplasty in March; on regular medicines, feeling well." },
  ],
  "General Medicine": [
    { reason: "Fever and body ache", intake: "Fever on and off for three days, mild cough." },
    { reason: "Diabetes review", intake: "Sugar readings slightly high this month; on metformin." },
    { reason: "Thyroid follow-up", intake: "On thyroid tablets for a year; bringing latest TSH report." },
    { reason: "Routine health check-up", intake: "Annual check-up; no specific complaints." },
    { reason: "Seasonal allergies", intake: "Sneezing and itchy eyes for two weeks." },
    { reason: "Acidity and indigestion", intake: "Burning after meals for a week, worse at night." },
  ],
};

function fakePhone(): string {
  const n = () => Math.floor(rand() * 10);
  return `+91 98${n()}${n()}${n()} ${n()}${n()}${n()}${n()}${n()}`;
}

function chunkPolicies() {
  const dir = join(process.cwd(), "data", "policies");
  const chunks: { doc_slug: string; doc_title: string; section: string; content: string }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const raw = readFileSync(join(dir, f), "utf8");
    const title = (raw.match(/^# (.+)$/m)?.[1] ?? f).trim();
    const parts = raw.split(/^## /m).slice(1);
    for (const p of parts) {
      const [heading, ...body] = p.split("\n");
      const content = body.join("\n").trim();
      if (content) chunks.push({ doc_slug: f.replace(/\.md$/, ""), doc_title: title, section: heading.trim(), content });
    }
  }
  return chunks;
}

const SESSIONS: [number, number][] = [];
for (const start of [10 * 60, 16 * 60]) for (let m = start; m < start + 180; m += 30) SESSIONS.push([Math.floor(m / 60), m % 60]);

async function main() {
  const db = pool();
  const client = await db.connect();
  const now = new Date();
  const t0 = today(now);
  const bookableAfter = now.getTime() + 60 * 60_000;

  try {
    // `--if-empty` lets the deploy's start command seed a fresh database without wiping a live one.
    if (process.argv.includes("--if-empty")) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM doctors`);
      if (rows[0].n > 0) {
        console.log(`[seed] skipped: database already has ${rows[0].n} doctors (run without --if-empty to re-seed)`);
        return;
      }
    }
    await client.query("BEGIN");
    await client.query(
      `TRUNCATE call_events, transcript_lines, escalations, intakes, appointments, calls, slots, patients, doctors, policy_chunks RESTART IDENTITY CASCADE`,
    );

    // Doctors
    const doctorIds: Record<string, number> = {};
    for (const d of DOCTORS) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO doctors (slug, name, specialty, bio, consult_fee_inr) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [d.slug, d.name, d.specialty, d.bio, d.fee],
      );
      doctorIds[d.slug] = r.rows[0].id;
    }

    // Patients
    const patientIds: number[] = [];
    for (const name of PATIENT_NAMES) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO patients (name, phone, is_seed, created_at) VALUES ($1,$2,true, now() - interval '30 days') RETURNING id`,
        [name, fakePhone()],
      );
      patientIds.push(r.rows[0].id);
    }

    // Working days: today .. today+7, Monday to Saturday.
    const days: number[] = [];
    for (let d = t0; d <= t0 + 7; d++) if (weekday(d) !== 0) days.push(d);
    const firstDay = days[0]; // today, or next working day if today is Sunday
    const upcoming = days.filter((d) => d > t0).slice(0, 3); // next 3 working days after today
    const demoDay = upcoming[1]; // "second working day": 16:00 must be open

    type Plan = { doctor: string; day: number; hh: number; mm: number; status: "open" | "booked" | "blocked" };
    const plan: Plan[] = [];
    for (const d of DOCTORS) {
      for (const day of days) {
        for (const [hh, mm] of SESSIONS) {
          const past = istInstant(day, hh, mm).getTime() < bookableAfter;
          const r = rand();
          let status: Plan["status"] = r < 0.55 ? "booked" : "open";
          if (past) status = status === "booked" && day === t0 ? "booked" : "blocked";
          plan.push({ doctor: d.slug, day, hh, mm, status });
        }
      }
    }

    // Guarantees for Dr. Meera Iyer.
    const meera = (day: number) => plan.filter((p) => p.doctor === "meera-iyer" && p.day === day);
    // ≥3 booked on the first working day (past morning slots count — a real practice day).
    {
      const slots = meera(firstDay);
      let booked = slots.filter((s) => s.status === "booked").length;
      for (const s of slots) {
        if (booked >= 3) break;
        if (s.status !== "booked") {
          s.status = "booked";
          booked++;
        }
      }
    }
    // ≥2 open on each of the next 3 working days.
    for (const day of upcoming) {
      const slots = meera(day);
      let open = slots.filter((s) => s.status === "open").length;
      for (const s of [...slots].reverse()) {
        if (open >= 2) break;
        if (s.status === "booked") {
          s.status = "open";
          open++;
        }
      }
    }
    // Demo day: morning fully booked, 16:00 open — so "this week" offers 16:00 on that day.
    if (demoDay !== undefined) {
      for (const s of meera(demoDay)) {
        if (s.hh < 16) s.status = "booked";
        if (s.hh === 16 && s.mm === 0) s.status = "open";
      }
      if (meera(demoDay).filter((s) => s.status === "open").length < 2) {
        const s = meera(demoDay).find((x) => x.hh === 17 && x.mm === 30);
        if (s) s.status = "open";
      }
    }
    // ≥8 booked across the week for Meera.
    {
      const all = plan.filter((p) => p.doctor === "meera-iyer");
      let booked = all.filter((s) => s.status === "booked").length;
      for (const s of all) {
        if (booked >= 8) break;
        if (s.status === "open" && !upcoming.includes(s.day)) {
          s.status = "booked";
          booked++;
        }
      }
    }

    // Insert slots, appointments and seed intakes.
    let slotCount = 0;
    let apptCount = 0;
    const usedToday = new Map<string, Set<number>>();
    for (const p of plan) {
      const doctor = DOCTORS.find((d) => d.slug === p.doctor)!;
      const startsAt = istInstant(p.day, p.hh, p.mm);
      const r = await client.query<{ id: number }>(
        `INSERT INTO slots (doctor_id, starts_at, status) VALUES ($1,$2,$3) RETURNING id`,
        [doctorIds[p.doctor], startsAt, p.status],
      );
      slotCount++;
      if (p.status === "booked") {
        const s = pick(REASONS[doctor.specialty]);
        // Never the same patient twice in one doctor's day.
        const usedKey = `${p.doctor}:${p.day}`;
        const used = usedToday.get(usedKey) ?? new Set<number>();
        let patientId = pick(patientIds);
        while (used.has(patientId)) patientId = pick(patientIds);
        used.add(patientId);
        usedToday.set(usedKey, used);
        const a = await client.query<{ id: number }>(
          `INSERT INTO appointments (slot_id, doctor_id, patient_id, reason, source, created_at)
           VALUES ($1,$2,$3,$4,'seed', now() - ($5 || ' days')::interval) RETURNING id`,
          [r.rows[0].id, doctorIds[p.doctor], patientId, s.reason, String(2 + Math.floor(rand() * 10))],
        );
        await client.query(`INSERT INTO intakes (appointment_id, chief_complaint, notes) VALUES ($1,$2,$3)`, [a.rows[0].id, s.reason, s.intake]);
        apptCount++;
      }
    }

    // Policies
    const chunks = chunkPolicies();
    const vectors: (number[] | null)[] = new Array(chunks.length).fill(null);
    for (let i = 0; i < chunks.length; i += 64) {
      const batch = chunks.slice(i, i + 64);
      const v = await embed(batch.map((c) => `${c.doc_title} — ${c.section}\n\n${c.content}`));
      if (v) v.forEach((vec, j) => (vectors[i + j] = vec));
    }
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await client.query(
        `INSERT INTO policy_chunks (doc_slug, doc_title, section, content, embedding) VALUES ($1,$2,$3,$4,$5)`,
        [c.doc_slug, c.doc_title, c.section, c.content, vectors[i] ? toVectorLiteral(vectors[i]!) : null],
      );
    }

    await client.query("COMMIT");
    const embedded = vectors.filter(Boolean).length;
    console.log(`[seed] doctors=${DOCTORS.length} patients=${patientIds.length} slots=${slotCount} appointments=${apptCount}`);
    console.log(`[seed] policy chunks=${chunks.length} embedded=${embedded}${embedded ? "" : " (no OPENAI_API_KEY: FTS fallback)"}`);
    console.log(`[seed] first working day: ${longDay(firstDay)}; demo day (16:00 open): ${demoDay !== undefined ? longDay(demoDay) : "n/a"}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
