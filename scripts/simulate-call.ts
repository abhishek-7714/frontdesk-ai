import "./load-env";

// Replays the rehearsed demo call against a running app, with human-like timing,
// so the /monitor plays the whole story without voice.
//
//   npm run simulate                                   # http://localhost:3100
//   npm run simulate -- --base https://<app>.up.railway.app
//   npm run simulate -- --speed 3                      # 3x faster (for tests)
//   npm run simulate -- --reset                        # reset demo data first

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const BASE = (flag("base") ?? process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SPEED = Number(flag("speed") ?? 1) || 1;
const NAME = flag("name") ?? "Abhishek Jain";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / SPEED));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

async function post<T = Record<string, unknown>>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type ToolResult = { ok: boolean; result?: Record<string, unknown>; message?: string };

async function main() {
  if (args.includes("--reset")) {
    const res = await fetch(`${BASE}/api/admin/reset`, { method: "POST", headers: { "x-admin-token": process.env.ADMIN_TOKEN ?? "" } });
    console.log(`reset: ${res.status}`);
    await sleep(1500);
  }

  const { call_id } = await post<{ call_id: string }>("/api/calls");
  console.log(`call ${call_id} → ${BASE}`);
  const say = async (role: "patient" | "agent", text: string) => {
    await post(`/api/calls/${call_id}/transcript`, { role, text });
    console.log(`${role === "agent" ? "Asha   " : "Patient"}: ${text}`);
    // Time spent "speaking" before the next turn, roughly 55 ms per character.
    await sleep(Math.min(5200, 900 + text.length * 38));
  };
  const tool = async (name: string, params: Record<string, unknown>) => {
    await sleep(jitter(500, 900));
    const r = await post<ToolResult>(`/api/tools/${name}`, { call_id, ...params });
    console.log(`  ↳ ${name} ${r.ok ? "ok" : `failed: ${r.message}`}`);
    await sleep(jitter(400, 700));
    return r;
  };

  await sleep(1200);
  await say("agent", "Hello, thank you for calling Fernleaf Clinic. This is Asha. How can I help you today?");
  await say("patient", "Hi Asha. I've had knee pain for about two weeks. Can I see an orthopaedic doctor this week?");
  await tool("search_policy", { query: "orthopaedics knee appointment what to bring" });
  const avail = await tool("check_availability", { specialty: "Orthopaedics", day_preference: "this week" });

  const slots = ((avail.result?.slots as { slot_id: number; spoken: string }[]) ?? []).slice();
  if (!slots.length) throw new Error("No slots offered; run npm run seed first.");
  const offered = slots.map((s) => s.spoken).join(", or ");
  await say("agent", `Of course. Dr. Meera Iyer, our orthopaedic specialist, can see you ${offered}. The consultation fee is 900 rupees. Which works best?`);

  // Prefer the rehearsed 4 PM slot.
  const chosen = slots.find((s) => /\b4 PM\b/.test(s.spoken)) ?? slots[slots.length - 1];
  const dayWord = chosen.spoken.match(/(today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/)?.[1] ?? "That one";
  const timeWord = chosen.spoken.match(/at ([\d:]+ [AP]M)/)?.[1] ?? "";
  await say("patient", `${dayWord === "today" ? "Today" : dayWord}${timeWord ? ` at ${timeWord.replace(" PM", "").replace(" AM", "")}` : ""} works.`);
  await say("agent", "Lovely. May I have your full name, please?");
  await say("patient", `It's ${NAME}.`);
  await say("agent", `Thank you, ${NAME.split(" ")[0]}. And a mobile number we can reach you on?`);
  await say("patient", "Nine eight seven six five, four three two one zero.");
  await say("agent", "That's 98765 43210. Let me book that for you now.");
  const booked = await tool("book_appointment", { slot_id: chosen.slot_id, patient_name: NAME, patient_phone: "98765 43210", reason: "Knee pain, 2 weeks" });
  const confirmation = (booked.result?.confirmation as string) ?? "You're booked.";
  await say("agent", `${confirmation} I'll ask two or three quick questions for the doctor. What's the problem, and how long has it been going on?`);
  await say("patient", "Pain in my right knee, for about two weeks now.");
  await tool("save_intake", { chief_complaint: "Right knee pain", duration: "about two weeks" });
  await say("agent", "I'm sorry to hear that. How bad is it, and does anything make it worse?");
  await say("patient", "Moderate, I'd say. It gets worse when I climb stairs.");
  await tool("save_intake", { chief_complaint: "Right knee pain", duration: "about two weeks", severity: "Moderate, worse on stairs" });
  await say("agent", "Thank you. Do you take any regular medicines?");
  await say("patient", "No, nothing regular.");
  await tool("save_intake", { chief_complaint: "Right knee pain", duration: "about two weeks", severity: "Moderate, worse on stairs", current_medications: "None" });
  await say(
    "agent",
    `All set. You're seeing Dr. Meera Iyer ${chosen.spoken}. Please bring any previous X-rays or reports, and wear loose clothing. Take care, ${NAME.split(" ")[0]}!`,
  );
  await say("patient", "Thank you so much. Bye!");
  await sleep(800);
  const end = await post<{ summary?: string }>(`/api/calls/${call_id}/end`, {});
  console.log(`ended. summary: ${end.summary}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
