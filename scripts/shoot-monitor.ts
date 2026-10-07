// Runs the simulator and captures /monitor at key moments at 1920×1080 and 1440×900.
//   npx tsx scripts/shoot-monitor.ts [outDir] [--base http://localhost:3100] [--speed 2]
import "./load-env";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const out = args[0] && !args[0].startsWith("--") ? args[0] : "screenshots";
const base = flag("base") ?? "http://localhost:3100";
const speed = flag("speed") ?? "1.5";
mkdirSync(out, { recursive: true });

const sizes = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
];

async function snap(pages: { name: string; page: Page }[], label: string) {
  await Promise.all(pages.map(({ name, page }) => page.screenshot({ path: `${out}/monitor-${name}-${label}.png` })));
  console.log(`  📸 ${label}`);
}

async function main() {
  await fetch(`${base}/api/admin/reset`, { method: "POST", headers: { "x-admin-token": process.env.ADMIN_TOKEN ?? "" } });
  const browser = await chromium.launch();
  const pages = await Promise.all(
    sizes.map(async (s) => {
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
      await page.goto(`${base}/monitor`, { waitUntil: "networkidle" });
      return { name: s.name, page };
    }),
  );
  await pages[0].page.waitForTimeout(2500);
  await snap(pages, "1-idle");

  const sim = spawn("npx", ["tsx", "scripts/simulate-call.ts", "--base", base, "--speed", speed], { stdio: "inherit" });
  const simDone = new Promise((r) => sim.on("exit", r));
  const p = pages[0].page;
  const wait = async (text: string, label: string, extra = 1200) => {
    await p.getByText(text, { exact: false }).first().waitFor({ timeout: 120_000 });
    await p.waitForTimeout(extra);
    await snap(pages, label);
  };
  await wait("Live transcript", "2-incoming", 2200);
  await wait("Slots offered", "3-slots", 1800);
  await wait("Appointment booked", "4-booked", 1800);
  await wait("Severity", "5-intake", 1500);
  await wait("Pre-visit brief", "6-ended", 2500);
  await simDone;
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
