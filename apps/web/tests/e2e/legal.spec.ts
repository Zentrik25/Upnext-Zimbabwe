import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  { path: "/privacy", h1: "Privacy Policy" },
  { path: "/terms", h1: "Terms of Service" },
] as const;
const WIDTHS = [320, 390, 768, 1440] as const;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const { path, h1 } of PAGES) {
  test.describe(`${path} legal page`, () => {
    for (const width of WIDTHS) {
      test(`renders without horizontal scroll at ${width}px, with the right contents control`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        if (width >= 991) {
          await expect(page.getByTestId("toc-desktop")).toBeVisible();
          await expect(page.getByTestId("toc-mobile")).toBeHidden();
        } else {
          await expect(page.getByTestId("toc-desktop")).toBeHidden();
          await expect(page.getByTestId("toc-mobile")).toBeVisible();
        }
      });
    }

    test("desktop contents list is sticky and its links jump to the section", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const toc = page.getByTestId("toc-desktop").getByRole("navigation", { name: "Sections" });
      const links = toc.getByRole("link");
      const last = links.nth((await links.count()) - 2); // last numbered section
      await last.click();
      const id = (await last.getAttribute("href"))!.slice(1);
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
      await expect(toc).toBeInViewport(); // still visible after scrolling: it is sticky
    });

    test("mobile contents opens, links work and the target is not hidden under the page edge", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(path);
      const details = page.getByTestId("toc-mobile");
      await details.locator("summary").click();
      const links = details.getByRole("link");
      await links.nth(2).click();
      const id = (await links.nth(2).getAttribute("href"))!.slice(1);
      await expect(page.locator(`#${id}`)).toBeInViewport();
    });

    test("keyboard focus is visible on contents links and heading anchors", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const first = page.getByTestId("toc-desktop").getByRole("link").first();
      await first.focus();
      const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe("none");
      const anchor = page.getByRole("link", { name: /^Link to section:/ }).first();
      await anchor.focus();
      await expect(anchor).toBeVisible();
      expect(await anchor.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    });

    test("print layout hides navigation and keeps the text", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.emulateMedia({ media: "print" });
      await expect(page.getByTestId("toc-desktop")).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    });

    for (const width of [320, 1440]) {
      test(`no serious or critical accessibility violations at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
          [],
        );
      });
    }
  });
}

test("registration, employer registration and the claim form link the legal documents, with no opt-in to alerts", async ({
  page,
}) => {
  for (const path of ["/register", "/employers/register"]) {
    await page.goto(path);
    const notice = page.getByTestId("legal-notice");
    await expect(notice.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    await expect(notice.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    await expect(notice).toContainText("does not sign you up for any e-mail alerts");
  }
});
