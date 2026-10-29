import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("phone header: logo and hamburger, everything else in the menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the bar shows only the logo and the menu button, with no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("menu-button")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
  });

  test("the menu opens full screen with the bar's links and Register / Sign in, and Close returns to the page", async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByTestId("menu-button");
    await button.click();
    const panel = page.getByRole("dialog", { name: "Menu" });
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(box.height).toBeGreaterThanOrEqual(843);
    const nav = panel.getByRole("navigation", { name: "Menu" });
    await expect(nav.getByRole("link", { name: "Opportunities" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "For employers" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Register" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Sign in" })).toBeVisible();
    // the page behind cannot scroll
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    await panel.getByRole("button", { name: "Close menu" }).click();
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("Escape closes it and choosing a link navigates and closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("menu-button").click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByTestId("menu-button").click();
    await page.getByRole("dialog").getByRole("link", { name: "Opportunities" }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("no serious or critical accessibility violations with the menu open", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("menu-button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });

  test("rotating to a wide screen closes the menu and shows the normal bar", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("menu-button").click();
    await page.setViewportSize({ width: 900, height: 600 });
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByTestId("menu-button")).toBeHidden();
  });
});

test("wide screens keep the normal header bar and no hamburger", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByTestId("menu-button")).toBeHidden();
});
