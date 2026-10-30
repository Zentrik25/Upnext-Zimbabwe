// Screenshot + horizontal-overflow audit. Usage: node tools/ui-audit.mjs <outDir> [baseUrl]
// Run from apps/web so that `playwright` resolves.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");
const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
const slug = process.env.AUDIT_SLUG ?? "";
const PAGES = [
  "/", "/opportunities", "/opportunities?category=jobs", "/categories", slug && `/opportunities/${slug}`, "/saved", "/sign-in", "/register",
  "/forgot-password", "/about", "/employers", "/privacy", "/terms", "/contact", "/guides",
  "/guides/how-to-find-jobs-in-zimbabwe", "/guides/apply-safely-and-avoid-scams", "/guides/how-listings-are-verified",
  "/no-such-page", slug && `/opportunities/${slug}/report`,
].filter(Boolean);
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];
const SHOT = new Set([390, 1440]);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 900 }, ...(process.env.AUDIT_STATE ? { storageState: process.env.AUDIT_STATE } : {}) });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    try {
      await page.goto(base + p, { waitUntil: "load", timeout: 30000 }); await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      results.push({ path: p, width: w, overflow: m.sw > m.cw, sw: m.sw });
      if (SHOT.has(w)) await page.screenshot({ path: `${out}/${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${w}.png`, fullPage: true });
    } catch (e) { results.push({ path: p, width: w, error: String(e).slice(0, 120) }); }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/overflow.json`, JSON.stringify(results, null, 1));
console.log(results.filter((r) => r.overflow || r.error).map((r) => JSON.stringify(r)).join("\n") || "no overflow, no errors");
