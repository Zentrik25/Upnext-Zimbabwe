// Captures the e-mail preview (apps/api: `python manage.py preview_emails --out DIR`) in four views each:
// desktop and phone, light and dark, plus phone with images blocked. Development tool; nothing is sent.
// Usage: NODE_PATH=$(npm root -g) node tools/email_preview_screenshots.mjs PREVIEW_DIR OUT_DIR [kind.variant ...]
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [dir, out, ...only] = process.argv.slice(2);
if (!dir || !out) throw new Error("usage: email_preview_screenshots.mjs PREVIEW_DIR OUT_DIR [kind.variant ...]");
mkdirSync(out, { recursive: true });
const names = readdirSync(dir).filter((f) => f.endsWith(".html") && /\.(normal|long|minimal)\.html$/.test(f)).map((f) => f.replace(/\.html$/, ""));
const picked = only.length ? names.filter((n) => only.includes(n)) : names;
const views = [
  { id: "desktop-light", width: 760, scheme: "light" },
  { id: "desktop-dark", width: 760, scheme: "dark" },
  { id: "phone-light", width: 375, scheme: "light" },
  { id: "phone-dark", width: 375, scheme: "dark" },
  { id: "phone-320-light", width: 320, scheme: "light" },
  { id: "phone-noimages", width: 375, scheme: "light", blockImages: true },
];
const browser = await chromium.launch();
for (const v of views) {
  const context = await browser.newContext({ viewport: { width: v.width, height: 900 }, colorScheme: v.scheme, deviceScaleFactor: 1 });
  if (v.blockImages) await context.route("**/*.png", (r) => r.abort());
  const page = await context.newPage();
  for (const name of picked) {
    await page.goto("file://" + resolve(join(dir, name + ".html")));
    await page.screenshot({ path: join(out, `${name}.${v.id}.png`), fullPage: true });
    // no horizontal overflow at this width
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) console.log(`OVERFLOW ${name} ${v.id}: ${overflow}px`);
  }
  await context.close();
}
await browser.close();
console.log(`captured ${picked.length} messages x ${views.length} views into ${out}`);
