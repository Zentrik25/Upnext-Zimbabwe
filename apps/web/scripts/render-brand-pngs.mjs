// Renders the PNG brand assets from the SVG masters in public/brand/ (run after tools/brand/build_assets.py):
//   node scripts/render-brand-pngs.mjs   (set PW_CHROMIUM=/path/to/chrome if Playwright has no browser of its own)
// Needs a Chromium that Playwright can launch. Output: favicons, Apple touch icon, PWA icons, profile icon, Open Graph.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../public/brand");
const svg = (name) => readFileSync(join(dir, name), "utf8");

const icons = [
  ["favicon-16.png", "icon-white-rounded.svg", 16],
  ["favicon-32.png", "icon-white-rounded.svg", 32],
  ["apple-touch-icon.png", "icon-black.svg", 180],
  ["icon-192.png", "icon-black-rounded.svg", 192],
  ["icon-512.png", "icon-black-rounded.svg", 512],
  ["icon-maskable-512.png", "icon-black.svg", 512],
  ["social-profile-400.png", "icon-black.svg", 400],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage();
for (const [out, src, size] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg(src).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.screenshot({ path: join(dir, out), omitBackground: true });
}

// og-image.png (1200x630) is owner-supplied artwork, cropped and compressed to 8-bit PNG (under 300 KB so WhatsApp shows
// it). It is deliberately not generated here: running this script must not replace it.
await browser.close();
