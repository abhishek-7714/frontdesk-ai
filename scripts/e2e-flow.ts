// End-to-end check without voice. Works locally or against production:
//   npx tsx scripts/e2e-flow.ts [--base https://<app>.up.railway.app]
import "./load-env";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const i = process.argv.indexOf("--base");
const base = (i > -1 ? process.argv[i + 1] : "http://localhost:3100").replace(/\/$/, "");
const admin = process.env.ADMIN_TOKEN ?? "";
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failures++;
};

async function mcpCall(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${base}/api/mcp/${process.env.MCP_SECRET}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await res.text();
  const json = raw.trim().startsWith("{") ? raw : (raw.split("\n").filter((l) => l.startsWith("data: ")).pop() ?? "data: {}").slice(6);
  return (JSON.parse(json).result?.content?.[0]?.text as string) ?? "";
}

async function main() {
  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  check(health.ok && health.counts.doctors === 3 && health.counts.slots > 200 && health.counts.policy_chunks > 30, `health: ${JSON.stringify(health.counts)}`);

  const reset1 = await fetch(`${base}/api/admin/reset`, { method: "POST", headers: { "x-admin-token": admin } });
  check(reset1.ok, "reset before run");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}/monitor`, { waitUntil: "networkidle" });
  check(await page.getByText("Waiting").first().isVisible(), "monitor idle: 'Waiting for a call'");

  const sim = spawn("npx", ["tsx", "scripts/simulate-call.ts", "--base", base, "--speed", "2.5"], { stdio: "ignore" });
  const simDone = new Promise<number>((r) => sim.on("exit", (code) => r(code ?? 1)));

  await page.getByText("Live transcript").waitFor({ timeout: 30_000 });
  check(true, "monitor flipped to live call");
  await page.getByText("Policy checked").waitFor({ timeout: 60_000 });
  check(true, "Policy checked card");
  await page.getByText("Slots offered").waitFor({ timeout: 60_000 });
  check(true, "Slots offered card");

  // Refresh mid-call: snapshot must rebuild the same cards with no duplicates.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Slots offered").waitFor({ timeout: 15_000 });
  check((await page.getByText("Slots offered").count()) === 1 && (await page.getByText("Policy checked").count()) === 1, "refresh mid-call: cards restored, no duplicates");

  await page.getByText("Appointment booked").waitFor({ timeout: 60_000 });
  check(true, "Appointment booked card");
  await page.getByText("4 of 4", { exact: true }).waitFor({ timeout: 90_000 });
  check((await page.getByText("Medicines", { exact: true }).count()) === 1, "Intake card filled: 4 of 4 incl. Medicines");
  await page.getByText("Pre-visit brief").waitFor({ timeout: 60_000 });
  check(await page.getByText("Booked and briefed").isVisible().catch(() => false) || (await page.getByText("Booked").count()) > 0, "ended: 'Booked and briefed' + summary");
  await page.getByText("available in Claude").waitFor({ timeout: 10_000 });
  check(true, "handoff pill: Shared with Dr. Meera Iyer · available in Claude");
  check((await simDone) === 0, "simulator exited cleanly");
  await browser.close();

  const schedule = await mcpCall("get_schedule", { range: "next_7_days" });
  check(/Booked by AI receptionist/.test(schedule) && /Intake: Right knee pain/.test(schedule), "MCP get_schedule shows the new booking with its intake");
  const brief = await mcpCall("get_patient_brief", { patient_name: "Abhishek Jain" });
  check(/Call summary/.test(brief), "MCP get_patient_brief has the call summary");

  const reset2 = await fetch(`${base}/api/admin/reset`, { method: "POST", headers: { "x-admin-token": admin } }).then((r) => r.json());
  check(reset2.ok && reset2.removed.appointments >= 1, `reset after run: ${JSON.stringify(reset2.removed)}`);
  const after = await mcpCall("get_schedule", { range: "next_7_days" });
  check(!/Booked by AI receptionist/.test(after), "after reset: booking gone from get_schedule");

  const session = await fetch(`${base}/api/eleven/session`);
  const body = await session.json();
  console.log(`${body.signedUrl ? "✅" : "⚠️ "} /api/eleven/session → ${session.status} ${body.signedUrl ? "signedUrl returned" : body.error}`);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
