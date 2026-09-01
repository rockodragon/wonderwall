// Renders scripts/og-image.html to public/og-image.png at 1200x630.
// Chromium is used because the brand fonts are woff2: fontconfig-based
// SVG rasterisers can't load them, so a browser is the only renderer that
// produces the real typefaces rather than a fallback.
//
//   node scripts/render-og.mjs
//
// PLAYWRIGHT_CHROMIUM_PATH overrides the browser binary when the pinned
// Playwright build isn't the one installed locally.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "og-image.html");
const out = resolve(here, "../public/og-image.png");

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(`file://${source}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
