import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Reporting a public listing (M2): from the opportunity page to the form, accessible and without horizontal
 * scroll at 320, 390 and desktop widths, validation messages, and one real submission that returns a reference.
 * Needs the seeded demo listings (E2E_DEMO_DATA=1). Reports are rate limited per client (5 an hour), so the
 * whole journey sends one report.
 */
test.skip(process.env.E2E_DEMO_DATA !== "1", "needs seeded demo data (E2E_DEMO_DATA=1)");

const WIDTHS = [320, 390, 1440];

async function firstSlug(page: Page): Promise<string> {
  const response = await page.request.get("/api/v1/opportunities?limit=1");
  expect(response.ok()).toBe(true);
  return (await response.json()).data[0].slug as string;
}

async function clean(page: Page, label: string, width: number) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `axe ${label} @${width}`,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    `horizontal scroll ${label} @${width}`,
  ).toBeLessThanOrEqual(0);
}

for (const width of WIDTHS) {
  test(`report link and form are accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const slug = await firstSlug(page);
    await page.goto(`/opportunities/${slug}`);
    await clean(page, "detail", width);
    await page.getByTestId("report-link").click();
    await expect(page).toHaveURL(new RegExp(`/opportunities/${slug}/report$`));
    await expect(page.getByRole("heading", { level: 1, name: "Report this opportunity" })).toBeVisible();
    await clean(page, "report form", width);

    // Every reason has a visible label and there is no file upload.
    for (const label of [
      "Suspected fake job",
      "Recruitment scam or payment request",
      "Incorrect application information",
      "Expired listing",
      "Misleading content",
      "Duplicate listing",
      "Other concern",
    ])
      await expect(page.getByLabel(label)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    // Sending nothing explains what to fix, without leaving the page, and stays accessible.
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "to fix" })).toBeFocused();
    await clean(page, "report form with errors", width);
  });
}

test("a report is accepted and returns a reference; the listing stays published", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const slug = await firstSlug(page);
  await page.goto(`/opportunities/${slug}/report`);
  await page.getByLabel("Expired listing").check();
  await page
    .getByLabel(/Tell us what concerns you/)
    .fill("The closing date on the issuer's page has passed.");
  await page.getByRole("button", { name: "Send report" }).click();
  const reference = page.getByTestId("report-reference");
  await expect(reference).toHaveText(/^R-[A-Z2-9]{8}$/);
  await expect(page.getByText(/not removed automatically/)).toBeVisible();
  await clean(page, "report confirmation", 390);
  const after = await page.request.get(`/api/v1/opportunities/${slug}`);
  expect(after.status()).toBe(200);
  expect((await after.json()).status).toBe("published");
});

test("an unknown listing cannot be reported", async ({ page }) => {
  const response = await page.goto("/opportunities/no-such-listing-here/report");
  expect(response?.status()).toBe(404);
});
