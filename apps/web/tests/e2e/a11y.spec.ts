import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Accessibility and mobile audit of every public and account page (A11Y-01…A11Y-05): axe at four widths, no
 * horizontal scroll, one h1, one title, landmarks, target size (WCAG 2.2 2.5.8), 400% reflow and keyboard use.
 * Signed-in pages need E2E_DEMO_PASSWORD (a fictional demo account on a throwaway stack).
 */
test.skip(process.env.E2E_DEMO_DATA !== "1", "needs seeded demo data (E2E_DEMO_DATA=1)");

const WIDTHS = [320, 390, 768, 1440];
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PASSWORD = process.env.E2E_DEMO_PASSWORD;

const PUBLIC = [
  "/",
  "/opportunities",
  "/opportunities?category=jobs",
  "/opportunities?q=zzzzqqqq",
  "/opportunities?employment_type=bogus",
  "/about",
  "/employers",
  "/employers/register",
  "/contact",
  "/privacy",
  "/terms",
  "/register",
  "/sign-in",
  "/forgot-password",
  "/reset-password?token=x",
  "/verify-email?token=x",
  "/no-such-page",
];
const SIGNED_IN = ["/account", "/saved", "/employer", "/employer/claim"];

async function checkPage(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `axe ${path} @${width}`,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    `horizontal scroll ${path} @${width}`,
  ).toBeLessThanOrEqual(0);
  if (SHOTS)
    await page.screenshot({
      path: `${SHOTS}/${path.replace(/[^a-z0-9]+/gi, "_") || "home"}-${width}.png`,
      fullPage: true,
    });
}

async function structure(page: Page, path: string) {
  await page.goto(path);
  expect(await page.locator("html").getAttribute("lang"), path).toBe("en");
  expect((await page.title()).trim().length, `title ${path}`).toBeGreaterThan(3);
  const h1 = await page.getByRole("heading", { level: 1 }).count();
  expect(h1, `h1 count ${path}`).toBe(1);
  for (const landmark of ["banner", "main", "contentinfo"] as const)
    expect(await page.getByRole(landmark).count(), `${landmark} ${path}`).toBe(1);
}

/** Controls that are smaller than 24×24 CSS px (WCAG 2.2 SC 2.5.8) and not inline links inside a sentence. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const isInlineText = (el: Element) => {
      if (el.tagName !== "A") return false;
      const parent = el.parentElement;
      return (
        !!parent && ["P", "LI", "SPAN"].includes(parent.tagName) && getComputedStyle(el).display === "inline"
      );
    };
    for (const el of document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button]",
    )) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest(".sr-only") || getComputedStyle(el).position === "fixed") continue;
      if (isInlineText(el) || el.closest("h1,h2,h3,h4,h5,h6")) continue; // title links: spacing exception, whole row is also reachable through its "View details" button
      if (rect.width < 24 || rect.height < 24) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
      }
    }
    return out;
  });
}

test.describe("public pages", () => {
  for (const path of PUBLIC) {
    test(`${path}: axe, scroll and structure at every width`, async ({ page }) => {
      for (const width of WIDTHS) await checkPage(page, path, width);
      await structure(page, path);
    });
  }

  test("a job and a tender detail page", async ({ page }) => {
    for (const category of ["jobs", "tenders"]) {
      await page.goto(`/opportunities?category=${category}`);
      const href = await page
        .getByTestId("results")
        .getByRole("link", { name: /^View details for /i })
        .first()
        .getAttribute("href");
      for (const width of WIDTHS) await checkPage(page, href!, width);
      await structure(page, href!);
    }
  });

  test("touch targets are at least 24px at 390px on the main pages", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const problems: Record<string, string[]> = {};
    for (const path of ["/", "/opportunities", "/sign-in", "/register", "/about"]) {
      await page.goto(path);
      const small = await smallTargets(page);
      if (small.length) problems[path] = small;
    }
    expect(problems).toEqual({});
  });

  test("content reflows at 400% zoom (320×256 equivalent) without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    for (const path of ["/", "/opportunities", "/sign-in", "/register", "/about", "/privacy"]) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        path,
      ).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("keyboard", () => {
  test("the skip link is first and every tab stop shows a focus indicator", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toMatch(/skip/i);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null; // dev overlay only
        const style = getComputedStyle(el);
        const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
        const shadow = style.boxShadow !== "none";
        return {
          id: `${el.tagName}:${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}`,
          visible: outline || shadow,
        };
      });
      if (info) {
        expect(info.visible, `no visible focus on ${info.id}`).toBe(true);
        seen.add(info.id);
      }
      await page.keyboard.press("Tab");
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  test("the home search is usable by keyboard alone", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search by title, organisation or keyword").focus();
    await page.keyboard.type("engineer");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/opportunities\?q=engineer/);
    await expect(page.getByTestId("result-count")).toBeVisible();
  });

  test("the sign-in form submits with Enter and ties errors to their fields", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Keyboard User");
    await page.getByLabel("E-mail address").fill("keyboard@example.org");
    await page.getByLabel("Password").fill("password1234");
    await page.keyboard.press("Enter");
    const field = page.getByLabel("Password");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    const describedBy = await field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText("Error:");
  });

  test("forms name the purpose of their fields for autofill", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Name")).toHaveAttribute("autocomplete", "name");
    await expect(page.getByLabel("E-mail address")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "new-password");
    await page.goto("/sign-in");
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  });
});

test.describe("signed-in pages", () => {
  test.skip(!PASSWORD, "needs E2E_DEMO_PASSWORD");
  test("account and saved pass axe at every width", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("E-mail address").fill("contributor@demo.upnext.example");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    for (const path of SIGNED_IN) for (const width of WIDTHS) await checkPage(page, path, width);
    await structure(page, "/account");
  });
});
