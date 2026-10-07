// Exercises the doctor-side MCP actions the way Claude calls them, then undoes them:
// block_day → schedule shows it, open slots drop, monitor gets a notice → reopen_day → slots restored.
// Creates no calls and does not reset anything.
//   npx tsx scripts/desk-check.ts [--base URL] [--day Saturday]
import "./load-env";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const base = (arg("base") ?? "http://localhost:3100").replace(/\/$/, "");
const day = arg("day") ?? "Saturday";
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failures++;
};

async function rpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(`${base}/api/mcp/${process.env.MCP_SECRET}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const raw = await res.text();
  const json = raw.trim().startsWith("{") ? raw : (raw.split("\n").filter((l) => l.startsWith("data: ")).pop() ?? "data: {}").slice(6);
  return JSON.parse(json).result;
}
const tool = async (name: string, args: Record<string, unknown>) => ((await rpc("tools/call", { name, arguments: args }))?.content?.[0]?.text as string) ?? "";
const openSlots = async () => ((await fetch(`${base}/api/health`).then((r) => r.json())) as { counts: { open_slots: number } }).counts.open_slots;
const notes = async () => ((await fetch(`${base}/api/monitor/latest`).then((r) => r.json())) as { notes: { id: number; kind: string; message: string }[] }).notes;

async function main() {
  const names = ((await rpc("tools/list", {}))?.tools ?? []).map((t: { name: string }) => t.name);
  check(["block_day", "reopen_day", "notify_front_desk"].every((n) => names.includes(n)), `tools/list: ${names.join(", ")}`);

  const before = await openSlots();
  const blocked = await tool("block_day", { day, reason: "conference" });
  console.log(`\n${blocked}\n`);
  const closed = Number(blocked.match(/(\d+) open slots? closed/)?.[1] ?? NaN);
  check(/is blocked for/.test(blocked), "block_day confirms the block");
  check((await openSlots()) === before - closed, `open slots dropped by ${closed}`);
  const again = await tool("block_day", { day, reason: "conference" });
  check(/0 open slots closed/.test(again) && (await notes()).filter((n) => n.kind === "day_blocked").length === 1, "block_day again is idempotent (no extra notice)");

  const schedule = await tool("get_schedule", { range: "next_7_days" });
  check(/· Blocked \(conference\)/.test(schedule), "get_schedule marks the day as Blocked");
  check(!/Needs rescheduling/.test(blocked) || /Needs rescheduling/.test(schedule) || /patients flagged/.test(schedule), "get_schedule flags patients to reschedule");

  const note = await tool("notify_front_desk", { message: "Please call the two post-ACL follow-ups first.", urgency: "urgent" });
  check(/Sent to the front desk/.test(note), "notify_front_desk confirms");
  const open = await notes();
  check(open.some((n) => n.kind === "day_blocked") && open.some((n) => n.kind === "note"), `monitor snapshot has ${open.length} open notices`);

  const reopened = await tool("reopen_day", { day });
  console.log(`\n${reopened}\n`);
  check(/is open again/.test(reopened) && (await openSlots()) === before, `reopen_day restored open slots to ${before}`);
  check(/was not blocked/.test(await tool("reopen_day", { day })), "reopen_day again says it was not blocked");

  const token = process.env.ADMIN_TOKEN ?? "";
  for (const n of await notes()) await fetch(`${base}/api/desk/notes/${n.id}/done`, { method: "POST", headers: { "x-admin-token": token } });
  check((await notes()).length === 0, "notices cleared with the admin Done endpoint");

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
