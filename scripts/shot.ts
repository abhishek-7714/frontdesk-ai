// Screenshot helper: npx tsx scripts/shot.ts <url> <out.png> [width] [height] [waitMs]
import { chromium } from "playwright";

async function main() {
  const [url, out, w = "1920", h = "1080", wait = "1500"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: out });
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
