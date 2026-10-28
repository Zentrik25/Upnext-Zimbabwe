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

// Open Graph: flat white card, the lockup at the left, one honest line of text (no counts, no claims).
await page.setViewportSize({ width: 1200, height: 630 });
const lockup = svg("upnext-lockup.svg").replace("<svg ", '<svg width="640" ');
await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:#fff;position:relative;
  font-family:Inter,'Helvetica Neue',Arial,sans-serif">
  <div style="position:absolute;left:80px;top:150px">${lockup}</div>
  <p style="position:absolute;left:80px;top:400px;width:900px;margin:0;font-size:44px;line-height:1.2;
    letter-spacing:-0.02em;color:#101828;font-weight:600">Jobs and opportunities in Zimbabwe.</p>
  <p style="position:absolute;left:80px;top:540px;margin:0;font-size:26px;color:#475467">upnext.co.zw</p>
  <div style="position:absolute;left:0;right:0;bottom:0;height:12px;background:#000"></div></body>`);
await page.screenshot({ path: join(dir, "og-image.png") });
await browser.close();
