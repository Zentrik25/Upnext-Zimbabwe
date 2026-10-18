import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  BOX_KEYS,
  COLOR_KEYS,
  TEXT_KEYS,
  expectMatchesReference,
  prodRgb,
  reference,
  refRgb,
  rgb,
} from "./support";

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
    await expect(page).toHaveTitle(/UPNEXT/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Discover what's next.");
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

  test("the staff sign-in page renders with its stylesheet through the proxy", async ({ page, request }) => {
    const response = await page.goto("/staff/login/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("#id_username")).toBeVisible();
    const css = page.locator('link[rel="stylesheet"]').first();
    const href = await css.getAttribute("href");
    expect(href).toMatch(/^\/static\/admin\/css\//);
    expect((await request.get(href ?? "")).status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
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

test.describe("flat design (gate 9: VIS-04, A11Y-08)", () => {
  for (const path of PAGES) {
    test(`nothing is rounded, shadowed or gradient-filled on ${path}`, async ({ page }) => {
      await page.goto(path);
      const offenders = await page.evaluate(() => {
        const bad: string[] = [];
        const controlSel =
          "button, select, textarea, input:not([type=checkbox], [type=radio], [type=hidden]), a.rounded-control, [role=search]";
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          const allowed = el.matches(controlSel) ? ["0px", "4px"] : ["0px"]; // D-29
          const radii = [
            cs.borderTopLeftRadius,
            cs.borderTopRightRadius,
            cs.borderBottomLeftRadius,
            cs.borderBottomRightRadius,
          ];
          if (radii.some((r) => !allowed.includes(r))) bad.push(`radius ${el.tagName}.${el.className}`);
          if (cs.boxShadow !== "none") bad.push(`shadow ${el.tagName}.${el.className}`);
          if (cs.backgroundImage !== "none") bad.push(`bg-image ${el.tagName}.${el.className}`);
          if (cs.textShadow !== "none") bad.push(`text-shadow ${el.tagName}.${el.className}`);
        }
        return bad;
      });
      expect(offenders).toEqual([]);
    });
  }

  test("body typography equals the reference (Arial 13px, line-height 1.55)", async ({ page }) => {
    await page.goto("/");
    await expectMatchesReference(page.locator("body"), reference("header_and_chrome", "body"), [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "color",
      "backgroundColor",
    ]);
  });
});

test.describe("reference parity of the primitives (1440px) — only DEV-01…DEV-04 may differ", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const ALL = [...BOX_KEYS, ...TEXT_KEYS, ...COLOR_KEYS];
  const BORDER_COLORS = ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];

  test("header, logo and notice", async ({ page }) => {
    await page.goto("/");
    await expectMatchesReference(
      page.getByRole("banner"),
      reference("header_and_chrome", "header"),
      ["backgroundColor", "borderBottomWidth", "borderBottomColor", "height"],
      { height: "59px" },
    );
    await expectMatchesReference(
      page.getByRole("banner").locator("span").first(),
      reference("header_and_chrome", "logo"),
      ["fontSize", "fontWeight", "letterSpacing", "color"],
    );
    await expectMatchesReference(
      page.getByRole("note"),
      reference("header_and_chrome", "notice"),
      [...BOX_KEYS, "fontSize", "backgroundColor", "borderBottomColor", "textAlign"].filter(
        (k) => k !== "borderTopWidth",
      ),
      {
        color: prodRgb("muted"),
      },
    );
    // DEV-02: production muted text is the approved #687380.
    await expect(page.getByRole("note")).toHaveCSS("color", rgb("#687380"));
  });

  test("hero heading", async ({ page }) => {
    await page.goto("/");
    await expectMatchesReference(
      page.getByRole("heading", { level: 1 }),
      reference("header_and_chrome", "h1"),
      ["fontSize", "fontWeight", "letterSpacing", "lineHeight", "color"],
    );
  });

  test("buttons", async ({ page }) => {
    await page.goto("/design-system");
    await expectMatchesReference(
      page.getByTestId("btn-secondary"),
      reference("header_and_chrome", "btnSecondary"),
      [...ALL, ...BORDER_COLORS],
      { borderTopLeftRadius: "4px" }, // D-29
    );
    const primary = page.getByTestId("btn-primary");
    await expect(primary).toHaveCSS("background-color", refRgb("accent"));
    await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(primary).toHaveCSS("min-height", "33px");
    await expect(primary).toHaveCSS("font-size", "12px");
    await expect(primary).toHaveCSS("padding", "7px 12px");
    await primary.hover();
    await expect(primary).toHaveCSS("background-color", refRgb("accent-hover"));
  });

  test("fields use the corrected control border and the reference box", async ({ page }) => {
    await page.goto("/design-system");
    const cases = [
      ["field-input", "field"],
      ["field-select", "filterSelect"],
    ] as const;
    for (const [id, evidenceKey] of cases) {
      await expectMatchesReference(
        page.getByTestId(id),
        reference("header_and_chrome", evidenceKey),
        [...ALL],
        {
          fontSize: "13px",
          borderTopLeftRadius: "4px", // D-29
        },
      );
      // DEV-04: reference #d9e1eb → approved #7693b7 on all four sides.
      for (const side of BORDER_COLORS)
        await expect(page.getByTestId(id)).toHaveCSS(
          side.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
          rgb("#7693b7"),
        );
      await expect(page.getByTestId(id)).toHaveCSS("min-height", "36px");
    }
  });

  test("search group matches the reference geometry with the corrected outline", async ({ page }) => {
    await page.goto("/design-system");
    const group = page.getByTestId("search-group");
    const box = await group.boundingBox();
    expect(box?.width).toBe(790);
    expect(box?.height).toBe(41);
    await expect(group).toHaveCSS("border-top-color", rgb("#7693b7"));
    await expect(group.getByRole("button")).toHaveCount(0); // no separate Search button (owner request)
    await expect(group.getByRole("searchbox")).toHaveCSS("min-height", "39px");
    await expect(group.getByRole("combobox")).toHaveCSS("width", "155px");
  });

  test("tags, panel and tabs", async ({ page }) => {
    await page.goto("/design-system");
    await expectMatchesReference(page.getByTestId("tag-urgent"), reference("listing_cards", "tagUrgent"), [
      ...ALL,
      ...BORDER_COLORS,
    ]);
    await expectMatchesReference(
      page.getByTestId("tag-default"),
      reference("listing_cards", "tag"),
      [...ALL, ...BORDER_COLORS],
      {
        color: prodRgb("meta"), // DEV-01
      },
    );
    await expectMatchesReference(page.getByTestId("panel"), reference("header_and_chrome", "asidecard"), [
      ...BOX_KEYS,
      ...BORDER_COLORS,
    ]);
    const tabs = page.getByRole("navigation", { name: "Opportunity categories" });
    await expectMatchesReference(
      tabs.getByRole("link", { name: "Jobs" }),
      reference("header_and_chrome", "pill"),
      [
        "color",
        "fontSize",
        "fontWeight",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "borderBottomWidth",
      ],
    );
    await expectMatchesReference(
      tabs.getByRole("link", { name: "All" }),
      reference("header_and_chrome", "pillActive"),
      ["color", "fontSize", "fontWeight", "borderBottomWidth", "borderBottomColor"],
    );
  });

  test("listing row and save control", async ({ page }) => {
    await page.goto("/design-system");
    const row = page.locator("article").first();
    await expect(row).toHaveCSS("border-bottom-width", "1px");
    await expect(row).toHaveCSS("border-bottom-color", refRgb("line"));
    await expect(row).toHaveCSS("padding", "15px 14px");
    await expectMatchesReference(
      row.getByRole("heading", { level: 3 }),
      reference("listing_cards", "jobtitle"),
      ["fontSize", "fontWeight", "lineHeight", "color"],
    );
    await expectMatchesReference(
      row.getByText("Example Power Services", { exact: true }),
      reference("listing_cards", "company"),
      ["fontSize", "lineHeight"],
      { color: prodRgb("company") },
    ); // DEV-03
    const avatar = row.locator("div[aria-hidden='true']").first();
    await expectMatchesReference(avatar, reference("listing_cards", "avatar"), [
      "backgroundColor",
      "color",
      "fontWeight",
      "borderTopWidth",
      "borderTopColor",
    ]);
    expect((await avatar.boundingBox())?.width).toBe(39);
    await expectMatchesReference(page.getByTestId("save-idle"), reference("listing_cards", "bookmark"), [
      "color",
      "fontSize",
      "lineHeight",
      "paddingLeft",
      "paddingRight",
    ]);
  });

  test("footer", async ({ page }) => {
    await page.goto("/");
    await expectMatchesReference(page.getByRole("contentinfo"), reference("header_and_chrome", "footer"), [
      "paddingTop",
      "paddingBottom",
      "borderTopWidth",
      "borderTopColor",
      "fontSize",
    ]);
    await expect(page.getByRole("contentinfo")).toHaveCSS("color", prodRgb("muted"));
  });
});
