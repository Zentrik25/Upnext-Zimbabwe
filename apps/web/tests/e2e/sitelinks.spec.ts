import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** The eight priority destinations (D-69), in a real browser: reachable from the home page through crawlable footer
 *  links, each with one H1 and, for the seven public ones, a self-canonical `<head>`; Sign In stays noindex. */
const DESTINATIONS: [string, string, boolean][] = [
  ["Jobs & opportunities in Zimbabwe", "/opportunities", true],
  ["Latest jobs", "/opportunities?category=jobs", true],
  ["Latest tenders", "/opportunities?category=tenders", true],
  ["Internships & attachments", "/opportunities?category=internships", true],
  ["Graduate trainee programmes", "/opportunities?category=graduate-programmes", true],
  ["Scholarships & fellowships", "/opportunities?category=scholarships", true],
  ["For employers", "/employers", true],
  ["Sign in", "/sign-in", false],
];

test.describe("priority destinations (D-69)", () => {
  test("the home page links all eight with plain, descriptive HTML links", async ({ request }) => {
    const html = await (await request.get("/")).text();
    for (const [label, href] of DESTINATIONS) {
      const escaped = href.replace(/[?]/g, "\\?").replace(/&/g, "&amp;");
      const name = label.replace(/&/g, "&amp;");
      expect(html, label).toMatch(new RegExp(`<a[^>]+href="${escaped}"[^>]*>${name}</a>`));
    }
  });

  test("each answers 200 with one heading and the right indexing signals", async ({ request }) => {
    const titles = new Set<string>();
    for (const [label, href, indexable] of DESTINATIONS) {
      const response = await request.get(href);
      expect(response.status(), label).toBe(200);
      const html = await response.text();
      const head = html.slice(0, html.indexOf("</head>"));
      expect(html.match(/<h1[\s>]/g) ?? [], label).toHaveLength(1);
      titles.add(/<title>([^<]*)<\/title>/.exec(head)![1]!);
      const robots = /<meta name="robots" content="([^"]+)"/.exec(head)?.[1];
      if (indexable) {
        // Demo data has open listings in every category, so every list is indexable here.
        expect(robots, label).toBeUndefined();
        const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head)?.[1] ?? "";
        expect(canonical.replace(/^https?:\/\/[^/]+/, "").replace(/&amp;/g, "&"), label).toBe(href);
      } else {
        expect(robots, label).toContain("noindex");
      }
    }
    expect(titles.size).toBe(DESTINATIONS.length);
  });

  test("each category list is a plain link whose first response already holds its listings (no script needed)", async ({
    request,
  }) => {
    const home = await (await request.get("/opportunities")).text();
    for (const [label, href] of DESTINATIONS.filter(([, h]) => h.includes("?category="))) {
      // The category tab is an ordinary <a href>, not a script-driven control.
      expect(home, label).toContain(`href="${href.replace(/&/g, "&amp;")}"`);
      const html = await (await request.get(href)).text();
      expect(html.match(/href="\/opportunities\/[a-z0-9-]+"/g)?.length ?? 0, label).toBeGreaterThan(0);
    }
  });

  test("the footer stays usable and accessible on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Footer" });
    for (const [label] of DESTINATIONS)
      await expect(footer.getByRole("link", { name: label, exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("footer")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });
});
