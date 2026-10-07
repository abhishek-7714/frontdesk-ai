// Full-page screenshots of the landing page: npx tsx scripts/shoot-landing.ts [--base URL]
import { chromium } from "playwright";

const i = process.argv.indexOf("--base");
const base = (i > -1 ? process.argv[i + 1] : "http://localhost:3100").replace(/\/$/, "");
const j = process.argv.indexOf("--sections"); // also save one shot per viewport into this directory
const sectionsDir = j > -1 ? process.argv[j + 1] : null;

async function main() {
  const browser = await chromium.launch();
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(base, { waitUntil: "networkidle" });
    // Scroll through so whileInView animations fire, then settle.
    const total = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < total; y += h / 2) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${w}x${h}: height ${total}px, horizontal overflow ${overflow}px`);
    if (sectionsDir) {
      for (let y = 0, k = 0; y < total; y += h, k++) {
        await page.evaluate((y) => window.scrollTo(0, y), y);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${sectionsDir}/landing-${w}-${k}.png` });
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `screenshots/landing-${w}-full.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
