/**
 * Screenshot tour of the observer UI for visual verification.
 * Usage: node scripts/screenshot.mjs [baseUrl] [outDir]
 * Assumes `npm run dev` (or preview) is serving the app.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("CONSOLE ERROR:", m.text());
});

await page.goto(base, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/01-landing.png` });

// Create a world with 60 years of history.
await page.fill('input[type="text"]', "harrowmere");
await page.selectOption("select", "60");
await page.click("button.go");
// Wait for fast-forward to finish (ffbar disappears, world page rendered).
await page.waitForSelector(".topbar", { timeout: 60_000 });
await page.waitForFunction(() => !document.querySelector(".ffbar"), null, { timeout: 300_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/02-world.png`, fullPage: true });

// People page, unusual souls.
await page.goto(`${base}/#/people`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/03-people.png`, fullPage: true });

// Open the most storied person.
const first = page.locator(".pcard a").first();
await first.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/04-person-life.png`, fullPage: true });

// Chronicle tab.
await page.click("text=Chronicle (", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/05-person-chronicle.png`, fullPage: true });

// Family tree tab.
await page.click("text=Family tree").catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/06-person-tree.png` });

// Houses.
await page.goto(`${base}/#/houses`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/07-houses.png`, fullPage: true });

// Realms.
await page.goto(`${base}/#/realms`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/08-realms.png`, fullPage: true });

// Peoples & tongues.
await page.goto(`${base}/#/peoples`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/09-peoples.png`, fullPage: true });

// Chronicle.
await page.goto(`${base}/#/chronicle`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/10-chronicle.png`, fullPage: true });

// Storylines.
await page.goto(`${base}/#/stories`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/11-stories.png`, fullPage: true });

await browser.close();
console.log(`Screenshots written to ${out}/`);
