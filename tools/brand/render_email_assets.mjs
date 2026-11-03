// Renders the PNG images used in e-mail (mail clients do not reliably show SVG) from the official SVGs.
// Usage: node tools/brand/render_email_assets.mjs     (needs Playwright's Chromium; output is committed)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(root, "apps/web/public/brand/email");
const jobs = [
  // white lockup for the dark header; displayed at 222x40, rendered at 2x for sharp phone screens
  { svg: join(root, "apps/web/public/brand/upnext-lockup-white.svg"), file: "upnext-email-logo.png", w: 444, h: 80 },
  // restrained illustration, verification message only; displayed at 240x180
  { svg: join(here, "email/verify-illustration.svg"), file: "verify-illustration.png", w: 480, h: 360 },
];
const browser = await chromium.launch();
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h } });
  const svg = readFileSync(j.svg, "utf8").replace(/<svg /, `<svg preserveAspectRatio="xMidYMid meet" style="width:${j.w}px;height:${j.h}px;display:block" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: j.w, height: j.h } });
  writeFileSync(join(out, j.file), png);
  await page.close();
}
await browser.close();
