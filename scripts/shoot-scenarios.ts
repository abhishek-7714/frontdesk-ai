// Screenshots the monitor's non-booking endings: npx tsx scripts/shoot-scenarios.ts [--base URL]
import "./load-env";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const i = process.argv.indexOf("--base");
const base = (i > -1 ? process.argv[i + 1] : "http://localhost:3100").replace(/\/$/, "");

async function main() {
  const browser = await chromium.launch();
  for (const scenario of ["emergency", "info"]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}/monitor`, { waitUntil: "networkidle" });
    const sim = spawn("npx", ["tsx", "scripts/simulate-call.ts", "--base", base, "--speed", "3", "--scenario", scenario], { stdio: "ignore" });
    const done = new Promise((r) => sim.on("exit", r));
    await page.getByText(scenario === "emergency" ? "Escalated to staff" : "Policy checked").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/monitor-1920-${scenario}-live.png` });
    await done;
    await page.getByText("Call complete").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/monitor-1920-${scenario}-ended.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `screenshots/monitor-1440-${scenario}-ended.png` });
    await page.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
