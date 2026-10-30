import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { refRgb, rgb } from "./support";

const PAGES = ["/", "/design-system"];
const WIDTHS = [320, 390, 768, 1440];

async function collectViolations(page: Page) {
  const messages: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") messages.push(m.text());
  });
  page.on("pageerror", (e) => messages.push(String(e)));
  return messages;
}

test.describe("gate 1/2/4 — the stack renders and talks to the API", () => {
  test("home renders with landmarks, categories and the latest listings", async ({ page }) => {
    const errors = await collectViolations(page);
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/UPNEXT Careers/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your next opportunity starts here.");
    for (const name of ["banner", "main", "contentinfo"] as const)
      await expect(page.getByRole(name)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Browse by category" })).toBeVisible();
    // In the Next.js dev server, HMR and un-nonced dev styles legitimately log CSP/WebSocket noise, so the
    // strict check runs against the production-mode stack (E2E_STRICT_CONSOLE=1, see LOCAL_DEVELOPMENT.md).
    if (process.env.E2E_STRICT_CONSOLE === "1")
      expect(errors, "no console errors / CSP violations").toEqual([]);
  });

  test("the API answers through /api/v1/ and the health probes", async ({ request }) => {
    const root = await request.get("/api/v1/");
    expect(root.status()).toBe(200);
    expect(await root.json()).toEqual({ name: "UPNEXT API", version: "v1", status: "ok" });
    expect((await request.get("/health/live")).status()).toBe(200);
    expect(await (await request.get("/health/ready")).json()).toEqual({ status: "ok" });
    const missing = await request.get("/api/v1/does-not-exist");
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });

  test("the staff workspace sends a visitor to sign in and is never indexed", async ({ page, request }) => {
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fworkspace/);
    const api = await request.get("/api/v1/staff/dashboard");
    expect([401, 403]).toContain(api.status());
    expect((await request.get("/robots.txt")).status()).toBe(200);
  });

  test("unknown pages show the designed not-found state", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("security headers (SEC-01)", () => {
  test("pages carry CSP with a nonce and hardening headers", async ({ request }) => {
    const response = await request.get("/");
    const h = response.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["x-powered-by"]).toBeUndefined();
    if (process.env.BASE_URL?.startsWith("https://")) {
      // The local TLS rehearsal turns HSTS on (P5-03); a real deployment does the same behind its own TLS.
      expect(h["strict-transport-security"]).toMatch(/^max-age=(\d{8,})$/);
    } else {
      expect(h["strict-transport-security"]).toBeUndefined(); // never over plain http
    }
  });

  test("each request gets a fresh nonce", async ({ request }) => {
    const a = (await request.get("/")).headers()["content-security-policy"];
    const b = (await request.get("/")).headers()["content-security-policy"];
    expect(a).not.toBe(b);
  });
});

test.describe("accessibility (A11Y-01…A11Y-05)", () => {
  for (const path of PAGES) {
    for (const width of [390, 1440]) {
      test(`axe finds no WCAG 2.2 A/AA violations on ${path} at ${width}px`, async ({ page }) => {
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
    for (const width of WIDTHS) {
      test(`no horizontal scroll on ${path} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test("the skip link is the first tab stop and focus is visible with the reference focus ring", async ({
    page,
  }) => {
    await page.goto("/design-system");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element);
      return {
        style: cs.outlineStyle,
        width: cs.outlineWidth,
        color: cs.outlineColor,
        offset: cs.outlineOffset,
      };
    });
    expect(ring).toEqual({ style: "solid", width: "2px", color: refRgb("focus"), offset: "2px" });
  });

  test("every control on the design-system page has an accessible name", async ({ page }) => {
    await page.goto("/design-system");
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("button, input, select, a[href]")]
        .filter((el) => {
          const e = el as HTMLElement;
          const label =
            e.getAttribute("aria-label") || (e as HTMLInputElement).labels?.[0]?.textContent || e.textContent;
          return !label || !label.trim();
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
  });
});

test.describe("design system (gate 9: VIS-04, A11Y-08, D-39, D-42)", () => {
  const SHADOWS = [
    "none",
    "rgba(23, 23, 23, 0.06) 0px 3px 6px 0px",
    "rgba(23, 23, 23, 0.08) 0px 15px 35px 0px",
    "rgba(50, 50, 93, 0.25) 0px 30px 45px -30px, rgba(0, 0, 0, 0.1) 0px 18px 36px -18px",
    "rgba(3, 3, 39, 0.25) 0px 14px 21px -14px, rgba(0, 0, 0, 0.1) 0px 8px 17px -8px",
  ];
  for (const path of PAGES) {
    test(`radii, shadows and gradients stay inside the design system on ${path}`, async ({ page }) => {
      await page.goto(path);
      const offenders = await page.evaluate((shadows) => {
        const bad: string[] = [];
        const allowed = ["0px", "1px", "4px", "5px", "6px", "8px"];
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          const radii = [
            cs.borderTopLeftRadius,
            cs.borderTopRightRadius,
            cs.borderBottomLeftRadius,
            cs.borderBottomRightRadius,
          ];
          if (radii.some((r) => !allowed.includes(r))) bad.push(`radius ${el.tagName}.${el.className}`);
          // Tailwind prefixes shadow utilities with fully transparent ring layers; only the visible layer counts.
          const visible =
            cs.boxShadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?/g, "").replace(/, $/, "") || "none";
          // The design system's focus and error ring (Level "Ring": 0 0 0 1-2px in one colour) is also allowed.
          const ring = /^rgb\(\d+, \d+, \d+\) 0px 0px 0px [12]px$/.test(visible);
          if (!shadows.includes(visible) && !ring) bad.push(`shadow ${el.tagName}.${el.className}`);
          // No gradients (the logo and the identity are flat): only hidden decorative elements may carry a background image.
          if (cs.backgroundImage !== "none" && el.getAttribute("aria-hidden") !== "true")
            bad.push(`bg-image ${el.tagName}.${el.className}`);
          if (cs.textShadow !== "none") bad.push(`text-shadow ${el.tagName}.${el.className}`);
        }
        return bad;
      }, SHADOWS);
      expect(offenders).toEqual([]);
    });
  }

  test("body typography follows the design system (Inter 300, 16px, line-height 1.4, deep navy on white)", async ({
    page,
  }) => {
    await page.goto("/");
    const body = page.locator("body");
    await expect(body).toHaveCSS("font-size", "16px");
    await expect(body).toHaveCSS("font-weight", "300");
    await expect(body).toHaveCSS("line-height", "22.4px");
    await expect(body).toHaveCSS("color", rgb("#061b31"));
    await expect(body).toHaveCSS("background-color", rgb("#ffffff"));
  });

  test("primary buttons use Stripe Purple and the 4px control radius", async ({ page }) => {
    await page.goto("/design-system");
    const primary = page.getByTestId("btn-primary");
    await expect(primary).toHaveCSS("background-color", rgb("#533afd"));
    await expect(primary).toHaveCSS("border-top-left-radius", "4px");
    await primary.hover();
    await expect(primary).toHaveCSS("background-color", rgb("#4434d4"));
  });

  test("form controls use the corrected DEV-04 border", async ({ page }) => {
    await page.goto("/design-system");
    await expect(page.getByTestId("field-input")).toHaveCSS("border-top-color", rgb("#64748d"));
    await expect(page.getByTestId("field-input")).toHaveCSS("min-height", "40px");
  });

  test.describe("dark theme (D-40; light is the default, owner 2026-10-29)", () => {
    // A dark device setting must NOT turn the site dark: only an explicit choice does.
    test.use({ colorScheme: "dark" });

    test("the default is light even on a dark device; Dark is explicit and remembered; Light returns", async ({
      page,
    }) => {
      await page.goto("/");
      const body = page.locator("body");
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
      await expect(body).toHaveCSS("background-color", rgb("#ffffff"));
      await expect(body).toHaveCSS("color", rgb("#061b31"));
      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(body).toHaveCSS("background-color", rgb("#0e0f2e"));
      await expect(body).toHaveCSS("color", rgb("#e8ecf0"));
      await page.reload();
      await expect(body).toHaveCSS("background-color", rgb("#0e0f2e"));
      await page.getByRole("button", { name: "Light" }).click();
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
      await expect(body).toHaveCSS("background-color", rgb("#ffffff"));
    });

    test("the primary button stays purple in dark with white text", async ({ page }) => {
      await page.goto("/design-system");
      await page.getByRole("button", { name: "Dark" }).first().click();
      const primary = page.getByTestId("btn-primary");
      await expect(primary).toHaveCSS("background-color", rgb("#665efd"));
      await expect(primary).toHaveCSS("color", rgb("#ffffff"));
    });

    test("no serious or critical accessibility violations on the home page in dark", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    });
  });
});
