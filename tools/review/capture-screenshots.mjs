// Captures real renders of the public pages for the Phase 2 acceptance review.
//   node tools/review/capture-screenshots.mjs <outDir>
// Needs the Compose stack on BASE_URL (default http://localhost:8080) with `seed_demo` data and the
// PLAYWRIGHT_CHROMIUM_EXECUTABLE environment variable if the bundled browser is not installed.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const base = process.env.BASE_URL ?? "http://localhost:8080";
const out = process.argv[2] ?? "screenshots";
mkdirSync(out, { recursive: true });
const widths = [320, 390, 768, 1440];

const api = async (path) => (await fetch(`${base}/api/v1/${path}`)).json();
const list = (await api("opportunities?limit=50")).data;
const find = (title) => list.find((r) => r.title === title)?.slug;
const slugs = {
  "detail-job-source-checked": find("Graduate Electrical Engineer"),
  "detail-tender-unverified": find("Supply of Solar Water Heating Units"),
  "detail-citation-only-no-deadline": find("Public Health Programme Assistant"),
  "detail-scholarship": find("Postgraduate Engineering Scholarship"),
  "detail-withdrawn": "education-support-internship-p4emun",
  "detail-expired": "research-innovation-fund-3jfqdb",
};
const pages = {
  "list-default": "/opportunities",
  "list-category-tenders": "/opportunities?category=tenders",
  "list-search-results": "/opportunities?q=engineer",
  "list-empty": "/opportunities?q=zzzzqqqqq",
  "list-invalid-filter": "/opportunities?employment_type=bogus",
  "list-page-2": "/opportunities?limit=4&sort=closing_soon",
  "home": "/",
  "not-found": "/opportunities/no-such-listing-abc123",
};
for (const [name, slug] of Object.entries(slugs)) if (slug) pages[name] = `/opportunities/${slug}`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  for (const [name, path] of Object.entries(pages)) {
    await page.goto(base + path);
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
console.log(`captured ${Object.keys(pages).length * widths.length} screenshots in ${out}`);
