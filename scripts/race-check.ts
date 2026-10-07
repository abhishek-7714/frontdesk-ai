// Fires N concurrent bookings at one slot from N different calls; exactly one may win.
//   npx tsx scripts/race-check.ts [--base URL] [--n 10]
import "./load-env";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const base = (arg("base") ?? "http://localhost:3100").replace(/\/$/, "");
const n = Number(arg("n") ?? 10);

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));

async function main() {
  const calls = await Promise.all(Array.from({ length: n }, () => post("/api/calls", {}).then((r) => r.json.call_id as string)));
  const avail = await post("/api/tools/check_availability", { call_id: calls[0], specialty: "Cardiology", day_preference: "next week" });
  const slot = avail.json.result?.slots?.[0];
  if (!slot) throw new Error(`no slot: ${JSON.stringify(avail.json)}`);
  const results = await Promise.all(
    calls.map((call_id, i) => post("/api/tools/book_appointment", { call_id, slot_id: slot.slot_id, patient_name: `Race Tester ${i + 1}`, patient_phone: `90000 0000${i}`, reason: "race test" })),
  );
  const wins = results.filter((r) => r.json.ok);
  const non200 = results.filter((r) => r.status !== 200);
  console.log(`slot ${slot.slot_id} (${slot.spoken}): ${wins.length} booked, ${n - wins.length} refused, ${non200.length} non-200`);
  console.log(`refusal message: ${results.find((r) => !r.json.ok)?.json.message}`);
  await Promise.all(calls.map((id) => post(`/api/calls/${id}/end`, {})));
  const ok = wins.length === 1 && non200.length === 0;
  console.log(ok ? "✅ no double booking" : "❌ double booking or non-200");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
