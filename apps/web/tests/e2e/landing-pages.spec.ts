import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Organic landing pages (D-68, SEO-13): server-rendered, self-canonical, accessible, and indexed only when the sitemap
 *  lists them. Written to hold for any data: a page with fewer than three open listings is noindex and unlisted. */
const SLUGS = ["harare", "bulawayo", "graduate-trainee", "engineering", "finance-and-accounting", "ngo"];

test.describe("landing pages (SEO-13)", () => {
  test("each is server-rendered with its own heading and canonical, and its robots tag agrees with the sitemap", async ({
    request,
  }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const slug of SLUGS) {
      const response = await request.get(`/jobs/${slug}`);
      expect(response.status(), slug).toBe(200);
      const html = await response.text();
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head, slug).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/jobs/${slug}"`));
      expect(html.match(/<h1[^>]*>/g) ?? [], slug).toHaveLength(1);
      const listed = sitemap.includes(`/jobs/${slug}</loc>`);
      const noindex = /<meta name="robots" content="noindex, follow"/.test(head);
      expect(noindex, `${slug}: listed in the sitemap exactly when indexable`).toBe(!listed);
      expect(html, slug).not.toContain('"JobPosting"');
    }
  });

  test("an unknown landing page is 404 and /jobs goes to the jobs list", async ({ request }) => {
    expect((await request.get("/jobs/doorway-page")).status()).toBe(404);
    const jobs = await request.get("/jobs", { maxRedirects: 0 });
    expect(jobs.status()).toBe(308);
    expect(jobs.headers()["location"]).toContain("/opportunities?category=jobs");
  });

  for (const width of [320, 390, 1440]) {
    test(`no axe violations and no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const slug of ["harare", "graduate-trainee"]) {
        await page.goto(`/jobs/${slug}`);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(results.violations.map((v) => `${slug} ${v.id}`)).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, slug).toBeLessThanOrEqual(0);
      }
    });
  }
});
