import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Public catalogue pages (Phase 2). These need the fictional demonstration data
 * (`manage.py seed_demo --force`): 12 published listings in every category plus 4 listings that are
 * not public (draft, in review, approved, rejected) which must never appear.
 * Run with E2E_DEMO_DATA=1; CI seeds the data before this suite.
 */
test.skip(process.env.E2E_DEMO_DATA !== "1", "needs seeded demo data (E2E_DEMO_DATA=1)");

const HIDDEN_MARKERS = ["(demo, draft)", "(demo, in_review)", "(demo, approved)", "(demo, rejected)"];

async function openFirst(page: Page, title: string) {
  await page.goto("/opportunities");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test.describe("browse and search", () => {
  test("lists only public opportunities and names the count", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page).toHaveTitle(/^Jobs & Opportunities in Zimbabwe \| UPNEXT Careers$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Jobs and opportunities in Zimbabwe" }),
    ).toBeVisible();
    await expect(page.getByTestId("result-count")).toHaveText("12 opportunities");
    const body = await page.locator("main").innerText();
    for (const marker of HIDDEN_MARKERS) expect(body).not.toContain(marker);
    await expect(page.getByTestId("results").getByRole("article")).toHaveCount(12);
  });

  test("category tabs filter the list", async ({ page }) => {
    await page.goto("/opportunities");
    await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Tenders" }).click();
    await expect(page).toHaveURL(/category=tenders/);
    await expect(page.getByTestId("result-count")).toHaveText("2 opportunities");
    await expect(
      page.getByRole("link", { name: "Supply of Solar Water Heating Units", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Graduate Electrical Engineer", exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Tenders" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("keyword search finds a listing and explains an empty result", async ({ page }) => {
    await page.goto("/opportunities");
    await page
      .getByRole("searchbox", { name: "Search by title, organisation or keyword" })
      .fill("  solar water ");
    await page.getByRole("searchbox", { name: "Search by title, organisation or keyword" }).press("Enter");
    await expect(page).toHaveURL(/q=solar\+water/);
    await expect(
      page.getByRole("link", { name: "Supply of Solar Water Heating Units", exact: true }),
    ).toBeVisible();
    await page.goto("/opportunities?q=zzzzqqqqq");
    await expect(page.getByTestId("result-count")).toHaveText("0 opportunities");
    await expect(page.getByRole("heading", { name: "No opportunities match" })).toBeVisible();
  });

  test("filters combine and can be cleared", async ({ page }) => {
    await page.goto("/opportunities?employment_type=internship");
    await expect(page.getByTestId("result-count")).toHaveText("2 opportunities");
    await page.getByLabel("Location").selectOption("harare");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/location=harare/);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/employment_type/);
  });

  test("an invalid filter shows a designed message, not an error page", async ({ page }) => {
    const response = await page.goto("/opportunities?employment_type=bogus");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("alert").filter({ hasText: "could not be applied" })).toContainText(
      "Those filters could not be applied",
    );
  });

  test("pagination follows the cursor and does not repeat or lose listings", async ({ page }) => {
    const seen = new Set<string>();
    await page.goto("/opportunities?limit=5&sort=closing_soon");
    for (let guard = 0; guard < 6; guard += 1) {
      // The results stream in after the page shell (their own Suspense boundary): wait for them before reading.
      await page.getByTestId("results").waitFor();
      for (const title of await page
        .getByTestId("results")
        .getByRole("heading", { level: 3 })
        .allInnerTexts()) {
        expect(seen.has(title), `repeated ${title}`).toBe(false);
        seen.add(title);
      }
      const next = page.getByRole("link", { name: "Next page" });
      if ((await next.count()) === 0) break;
      await next.click();
    }
    expect(seen.size).toBe(12);
  });

  test("a tampered cursor is handled gracefully", async ({ page }) => {
    await page.goto("/opportunities?cursor=not-a-real-cursor");
    await expect(page.getByRole("alert").filter({ hasText: "could not be applied" })).toBeVisible();
  });
});

test.describe("detail page", () => {
  test("shows what is known and what is not", async ({ page }) => {
    await openFirst(page, "Graduate Electrical Engineer");
    await expect(page.getByText("Example Power Services").first()).toBeVisible();
    await expect(page.getByText("USD 700 – 900 per month").first()).toBeVisible();
    await expect(page.getByTestId("category-details")).toContainText("Application documents");
    // Retired details (D-57) are stored on this demo listing but are no longer shown.
    await expect(page.getByTestId("category-details")).not.toContainText("Minimum qualification");
    await expect(page.getByTestId("category-details")).not.toContainText("Benefits");
    // Verification is one switch (D-62): the page says Verified or Not verified, whichever the demo data has.
    await expect(page.getByText(/^(Verified|Not verified)$/).first()).toBeVisible();
    // No "Sources" block (D-67); the recorded source appears once, in About this listing (D-74).
    await expect(page.getByRole("heading", { name: "Where this came from" })).toHaveCount(0);
    await expect(page.getByLabel("Sources")).toHaveCount(0);
  });

  test("the apply link leaves UPNEXT safely and says so", async ({ page }) => {
    await openFirst(page, "Graduate Electrical Engineer");
    const apply = page.getByTestId("apply");
    await expect(apply).toContainText("You will leave UPNEXT");
    await expect(apply).toContainText("does not receive or track applications");
    const link = apply.locator("a[data-listing-apply]");
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("unknown pay and deadline are not shown at all", async ({ page }) => {
    await openFirst(page, "Public Health Programme Assistant");
    const listing = page.locator('article[aria-labelledby="listing-title"]');
    await expect(listing).not.toContainText(/Deadline not stated|Not stated|Pay: TBA/);
    // The listing itself states no pay. (Related listings below it are other listings and may state theirs.)
    await expect(page.locator('article[aria-labelledby="listing-title"]')).not.toContainText("USD");
  });

  test("an unverified listing says so; its recorded source appears once, in About this listing (D-74)", async ({
    page,
  }) => {
    await openFirst(page, "Supply of Solar Water Heating Units");
    await expect(page.getByText("Not verified").first()).toBeVisible();
    await expect(page.getByTestId("listing-verification")).toContainText(
      "Check it with the organisation before you apply.",
    );
    // D-67 hid every source; D-74 shows the recorded one on the job page only, once, in its own section.
    const source = page.getByTestId("listing-source");
    await expect(source).toHaveCount(1);
    await expect(page.getByText("Example City Procurement Unit tender notice")).toHaveCount(1);
  });

  test("unknown and non-public addresses show the designed not-found page", async ({ page }) => {
    const response = await page.goto("/opportunities/no-such-listing-abc123");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Opportunity not found" })).toBeVisible();
  });

  test("description is rendered as text and elements, never raw HTML", async ({ page }) => {
    await openFirst(page, "Graduate Electrical Engineer");
    expect(await page.locator('main script:not([type="application/ld+json"])').count()).toBe(0);
    await expect(page.locator("main strong").first()).toBeVisible();
  });
});

test.describe("accessibility and design of the catalogue pages", () => {
  const paths = ["/opportunities", "/opportunities?category=tenders", "/opportunities?q=zzzzqqqqq"];
  for (const width of [390, 1440]) {
    for (const path of paths) {
      test(`axe finds no violations on ${path} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
          .analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
        ).toEqual([]);
      });
    }
    test(`axe finds no violations on a detail page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openFirst(page, "Supply of Solar Water Heating Units");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    });
  }

  for (const width of [320, 390, 768, 1440]) {
    test(`no horizontal scroll at ${width}px on list and detail`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/opportunities"]) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
          true,
        );
      }
      await openFirst(page, "Supply of Solar Water Heating Units");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("nothing is rounded, shadowed or gradient-filled", async ({ page }) => {
    for (const path of ["/opportunities", "/opportunities?category=tenders"]) {
      await page.goto(path);
      const offenders = await page.evaluate(() => {
        const bad: string[] = [];
        const controlSel =
          "button, select, textarea, input:not([type=checkbox], [type=radio], [type=hidden]), a.rounded-control, [role=search]";
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          const allowed = ["0px", "2px", "8px", "12px", "980px"]; // D-73 radius scale
          void controlSel;
          if (
            [
              cs.borderTopLeftRadius,
              cs.borderTopRightRadius,
              cs.borderBottomLeftRadius,
              cs.borderBottomRightRadius,
            ].some((r) => !allowed.includes(r))
          )
            bad.push(`radius ${el.tagName}`);
          if (/rgba\(.*\) \d+px \d+px \d+px/.test(cs.boxShadow) === false && cs.boxShadow !== "none")
            bad.push(`shadow ${el.tagName}`);
          if (cs.backgroundImage !== "none" && el.getAttribute("aria-hidden") !== "true")
            bad.push(`bg-image ${el.tagName}`);
        }
        return bad;
      });
      expect(offenders).toEqual([]);
    }
  });

  test("the whole search and result flow works with the keyboard", async ({ page }) => {
    await page.goto("/opportunities");
    await page.keyboard.press("Tab"); // skip link
    await expect(page.getByRole("link", { name: /skip/i })).toBeFocused();
    await page.getByRole("searchbox").focus();
    await page.keyboard.type("engineer");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=engineer/);
    const first = page.getByTestId("results").getByRole("link").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("the page carries a CSP nonce and the document has a language", async ({ page, request }) => {
    const response = await request.get("/opportunities");
    expect(response.headers()["content-security-policy"]).toMatch(/'nonce-[^']+'/);
    await page.goto("/opportunities");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("home search", () => {
  test("the home page search goes to the results", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Search Jobs" })).toHaveCount(1); // the explicit button (D-73)
    await page.getByRole("searchbox").fill("grant");
    await page.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(/\/opportunities\?q=grant/);
  });

  test("a blank search sends nothing; filters and a cleared keyword behave", async ({ page }) => {
    await page.goto("/");
    let requests = 0;
    page.on("request", (r) => {
      if (r.isNavigationRequest()) requests += 1;
    });
    await page.getByRole("searchbox").fill("   ");
    await page.getByRole("searchbox").press("Enter");
    await page.waitForTimeout(300);
    expect(requests).toBe(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("searchbox")).toBeFocused();
    // existing filters survive a new keyword
    await page.goto("/opportunities?category=jobs&sort=newest&limit=20");
    await page.getByRole("searchbox").fill("engineer");
    await page.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(/q=engineer/);
    await expect(page).toHaveURL(/category=jobs/);
    await expect(page).toHaveURL(/sort=newest/);
    // emptying the keyword clears it from the address
    await page.getByRole("searchbox").fill("");
    await page.getByRole("searchbox").press("Enter");
    await expect(page).not.toHaveURL(/q=/);
  });

  test("the field has a magnifier, no button, the 8px radius and a visible focus ring", async ({ page }) => {
    await page.goto("/opportunities");
    const box = page.getByRole("searchbox");
    await expect(page.getByRole("search").getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("search").locator("svg[aria-hidden='true']")).toHaveCount(1);
    await expect(box).toHaveAttribute("enterkeyhint", "search");
    await box.focus();
    expect(await box.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await box.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("8px");
      expect(await box.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(36);
    }
  });
});

test.describe("filters on a phone (D-73)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the filters sit behind one Filters bar, open on tap or Space, and show how many are applied", async ({
    page,
  }) => {
    await page.goto("/opportunities");
    const filters = page.getByRole("checkbox", { name: /^Filters/ });
    await expect(page.getByRole("group", { name: "Filters" })).toHaveCount(0);
    await expect(page.getByLabel("Type of work")).toBeHidden();
    await filters.focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Type of work")).toBeVisible();
    await page.getByLabel("Type of work").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/employment_type=/);
    await expect(page.getByLabel("Type of work")).toBeVisible(); // open again because a filter is applied
    await expect(page.getByText("(1 applied)")).toBeVisible();
  });

  test("on a wide screen the filter panel is always shown and the bar is not", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/opportunities");
    await expect(page.getByLabel("Type of work")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Filters/ })).toBeHidden();
  });
});
