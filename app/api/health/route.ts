import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = await query<{ doctors: number; slots: number; open_slots: number; chunks: number; embedded: number; appointments: number }>(`
      SELECT (SELECT count(*) FROM doctors)::int AS doctors,
             (SELECT count(*) FROM slots)::int AS slots,
             (SELECT count(*) FROM slots WHERE status = 'open' AND starts_at > now())::int AS open_slots,
             (SELECT count(*) FROM policy_chunks)::int AS chunks,
             (SELECT count(*) FROM policy_chunks WHERE embedding IS NOT NULL)::int AS embedded,
             (SELECT count(*) FROM appointments WHERE status = 'booked')::int AS appointments`);
    return NextResponse.json({
      ok: true,
      db: "up",
      counts: { doctors: row.doctors, slots: row.slots, open_slots: row.open_slots, policy_chunks: row.chunks, embedded_chunks: row.embedded, appointments: row.appointments },
      features: features(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, db: "down", error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
