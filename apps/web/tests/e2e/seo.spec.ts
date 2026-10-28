import { expect, test, type Page } from "@playwright/test";

/** Public website foundations: robots, sitemap, canonical and indexing rules, structured data, static pages. */
test.skip(process.env.E2E_DEMO_DATA !== "1", "needs seeded demo data (E2E_DEMO_DATA=1)");

/** Content of the robots meta tag, or null when the page has none (indexable by default). */
async function robotsMeta(page: Page): Promise<string | null> {
  const tag = page.locator('meta[name="robots"]');
  return (await tag.count()) === 0 ? null : tag.first().getAttribute("content");
}
const canonical = (page: Page) => page.locator('link[rel="canonical"]').first().getAttribute("href");

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test.describe("robots and sitemap (SEO-02, SEO-03)", () => {
  test("robots.txt allows public pages, blocks private ones and names the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/User-Agent: \*/i);
    for (const path of ["/staff/", "/api/", "/account", "/saved", "/sign-in", "/register", "/reset-password"])
      expect(text).toContain(`Disallow: ${path}`);
    expect(text).not.toMatch(/Disallow: \/$/m);
    expect(text).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test("sitemap.xml lists the static pages and exactly the open public listings", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    for (const path of ["", "/opportunities", "/about", "/contact", "/privacy", "/terms"])
      expect(urls.some((u) => u.replace(/\/$/, "").endsWith(path))).toBe(true);
    const listings = urls.filter((u) => /\/opportunities\/[a-z0-9-]+$/.test(u));
    const api = await (await request.get("/api/v1/opportunities?limit=50")).json();
    expect(listings).toHaveLength(api.data.length);
    for (const row of api.data)
      expect(listings.some((u) => u.endsWith(`/opportunities/${row.slug}`))).toBe(true);
    expect(urls.some((u) => u.includes("?") || u.includes("/staff") || u.includes("/account"))).toBe(false);
  });
});

test.describe("indexing rules (SEO-01, SEO-03)", () => {
  test("the plain list is indexed; filtered, searched and paged lists are not, and all point at the plain address", async ({
    page,
  }) => {
    await page.goto("/opportunities");
    expect(await robotsMeta(page)).toBeNull();
    expect(await canonical(page)).toMatch(/\/opportunities$/);
    for (const query of ["?category=jobs", "?q=engineer", "?sort=closing_soon", "?limit=2"]) {
      await page.goto(`/opportunities${query}`);
      expect(await robotsMeta(page), query).toContain("noindex");
      expect(await robotsMeta(page), query).toContain("follow");
      expect(await canonical(page), query).toMatch(/\/opportunities$/);
    }
  });

  test("account, sign-in and one-time-link pages are noindex", async ({ page }) => {
    for (const path of [
      "/sign-in",
      "/register",
      "/forgot-password",
      "/reset-password?token=x",
      "/verify-email?token=x",
    ]) {
      await page.goto(path);
      expect(await robotsMeta(page), path).toContain("noindex");
    }
  });

  test("unknown pages answer 404", async ({ request }) => {
    expect((await request.get("/no-such-page")).status()).toBe(404);
  });
});

test.describe("structured data (SEO-01)", () => {
  test("a job page carries a JobPosting that matches what the page says, plus a breadcrumb", async ({
    page,
  }) => {
    await page.goto("/opportunities?category=jobs");
    const link = page
      .getByTestId("results")
      .getByRole("link", { name: /^View details for /i })
      .first();
    await link.click();
    const title = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    const blocks = await jsonLd(page);
    const posting = blocks.find((b) => b["@type"] === "JobPosting");
    expect(posting, "JobPosting").toBeTruthy();
    expect(posting!.title).toBe(title);
    expect((posting!.hiringOrganization as { name: string }).name.length).toBeGreaterThan(0);
    expect(typeof posting!.datePosted).toBe("string");
    expect(posting!.url).toBe(await canonical(page));
    expect(posting!.directApply).toBe(false);
    const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList");
    expect((crumbs!.itemListElement as unknown[]).length).toBe(2);
    expect(await robotsMeta(page)).toBeNull(); // published listings are indexable
  });

  test("a tender page has a breadcrumb but no JobPosting", async ({ page }) => {
    await page.goto("/opportunities?category=tenders");
    await page
      .getByTestId("results")
      .getByRole("link", { name: /^View details for /i })
      .first()
      .click();
    const types = (await jsonLd(page)).map((b) => b["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).not.toContain("JobPosting");
  });

  test("the home page describes the site and its search", async ({ page }) => {
    await page.goto("/");
    const blocks = await jsonLd(page);
    expect(blocks.map((b) => b["@type"])).toEqual(expect.arrayContaining(["WebSite", "Organization"]));
    expect(await canonical(page)).toMatch(/^https?:\/\/[^/]+\/?$/);
  });
});

test.describe("home and static pages (SC-01, SC-14)", () => {
  test("home shows the categories and the latest listings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Browse by category" }).getByRole("link")).toHaveCount(
      6,
    );
    await expect(page.getByTestId("latest").getByRole("article")).toHaveCount(6);
    await page
      .getByRole("navigation", { name: "Browse by category" })
      .getByRole("link", { name: "Grants" })
      .click();
    await expect(page).toHaveURL(/category=grants/);
  });

  test("about explains the three verification labels from the same wording as the listings", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About UPNEXT Careers");
    for (const label of ["Not verified", "Source checked", "Verified with the issuer"])
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    expect(await robotsMeta(page)).toBeNull();
  });

  test("contact shows the one official address and no other mailbox", async ({ page }) => {
    await page.goto("/contact");
    const link = page.getByTestId("contact-email");
    await expect(link).toHaveText("info@upnext.co.zw");
    await expect(link).toHaveAttribute("href", "mailto:info@upnext.co.zw");
    const hrefs = await page
      .locator('a[href^="mailto:"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(new Set(hrefs)).toEqual(new Set(["mailto:info@upnext.co.zw"]));
  });

  for (const path of ["/privacy", "/terms"]) {
    test(`${path} is a draft for review: marked as such, not indexed, nothing claims legal approval`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByTestId("draft-notice")).toContainText("not been approved");
      expect(await robotsMeta(page)).toContain("noindex");
      const text = (await page.locator("main").innerText()).toLowerCase();
      expect(text).not.toMatch(/legally (approved|reviewed|compliant)|compliant with/);
      expect(text).toContain("[");
    });
  }

  test("the footer links every static page", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Footer" });
    for (const name of ["About", "Contact", "Privacy", "Terms"])
      await expect(footer.getByRole("link", { name })).toBeVisible();
  });
});
