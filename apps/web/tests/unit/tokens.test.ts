import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import tokens from "../../src/design/tokens.json";
import { colors, contrast, prod, readRepoFile, ref } from "./helpers";

describe("design tokens (VIS-*, A11Y-06/07/08)", () => {
  it("the colour tokens equal the Stripe-inspired design system values (D-39)", () => {
    expect(
      Object.fromEntries(
        Object.entries(colors)
          .filter(([n]) =>
            ["ink", "accent", "accent-hover", "line", "brand-dark", "ruby", "magenta"].includes(n),
          )
          .map(([n, t]) => [n, t.ref]),
      ),
    ).toEqual({
      ink: "#061b31",
      accent: "#533afd",
      "accent-hover": "#4434d4",
      line: "#e5edf5",
      "brand-dark": "#1c1e54",
      ruby: "#ea2261",
      magenta: "#f96bee",
    });
  });

  it("the only production deviations are DEV-01…DEV-04 and match ACCESSIBILITY_DEVIATIONS.md", () => {
    const deviating = Object.entries(colors).filter(([, t]) => t.prod);
    expect(new Set(deviating.map(([, t]) => t.dev))).toEqual(
      new Set(["DEV-01", "DEV-02", "DEV-03", "DEV-04"]),
    );
    expect(Object.fromEntries(deviating.map(([n, t]) => [n, t.dev]))).toMatchObject({
      muted: "DEV-01",
      good: "DEV-02",
      urgent: "DEV-03",
      "control-border": "DEV-04",
    });
    const doc = readRepoFile("docs/design/ACCESSIBILITY_DEVIATIONS.md");
    for (const [name, t] of deviating) {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${t.dev} `));
      expect(row, `${t.dev} row for ${name}`).toBeDefined();
      expect(row).toContain(t.prod);
      expect(row).toContain(t.ref);
    }
  });

  it("the DEV-04 control border is the corrected value", () => {
    expect(colors["control-border"]?.prod).toBe("#7a87a2");
  });

  it("production text pairs meet WCAG 2.2 AA (A11Y-06)", () => {
    const pairs: [string, string, number][] = [
      ["ink", "surface", 4.5],
      ["ink", "surface-pale", 4.5],
      ["ink", "row-hover", 4.5],
      ["muted", "surface", 4.5],
      ["muted", "surface-notice", 4.5],
      ["muted", "surface-pale", 4.5],
      ["muted", "row-hover", 4.5],
      ["meta", "surface", 4.5],
      ["meta", "tag-bg", 4.5],
      ["meta", "row-hover", 4.5],
      ["company", "surface", 4.5],
      ["company", "row-hover", 4.5],
      ["accent", "surface", 4.5],
      ["accent", "surface-pale", 4.5],
      ["brand-dark-text", "brand-dark", 4.5],
      ["white", "accent", 4.5],
      ["white", "accent-hover", 4.5],
      ["secondary-text", "surface", 4.5],
      ["nav-text", "surface", 4.5],
      ["eyebrow", "surface", 4.5],
      ["tab-text", "surface", 4.5],
      ["feed-tab-text", "surface", 4.5],
      ["check-text", "surface", 4.5],
      ["empty-text", "surface", 4.5],
      ["good", "good-bg", 4.5],
      ["urgent", "urgent-bg", 4.5],
      ["urgent", "surface", 4.5],
      ["avatar-text", "avatar-bg", 4.5],
    ];
    const failing = pairs
      .filter(([fg, bg, min]) => contrast(prod(fg), prod(bg)) < min)
      .map(([fg, bg]) => `${fg}/${bg}`);
    expect(failing).toEqual([]);
  });

  it("non-text pairs meet 3:1 (A11Y-07): control borders, focus ring, saved state, idle save glyph", () => {
    const pairs: [string, string][] = [
      ["control-border", "surface"],
      ["control-border", "surface-pale"],
      ["focus", "surface"],
      ["focus", "surface-pale"],
      ["focus", "row-hover"],
      ["save-on", "surface"],
      ["save-idle", "surface"],
      ["save-idle", "row-hover"],
    ];
    const failing = pairs.filter(([a, b]) => contrast(prod(a), prod(b)) < 3).map(([a, b]) => `${a}/${b}`);
    expect(failing).toEqual([]);
  });

  it("each deviation is the minimum necessary: the design-system value really fails, the corrected one passes", () => {
    const failsRef: [string, string, number][] = [
      ["muted", "surface-pale", 4.5],
      ["good", "good-bg", 4.5],
      ["urgent", "urgent-bg", 4.5],
      ["control-border", "surface", 3],
    ];
    for (const [fg, bg, min] of failsRef) {
      expect(contrast(ref(fg), ref(bg)), `${fg}/${bg} (design system)`).toBeLessThan(min);
      expect(contrast(prod(fg), prod(bg)), `${fg}/${bg} (corrected)`).toBeGreaterThanOrEqual(min);
    }
  });

  it("typography, radius, shadow and layout tokens equal the design system", () => {
    expect(tokens.fontFamily).toMatch(/^"sohne-var", "SF Pro Display"/);
    expect(tokens.fontSizes.hero).toBe("clamp(32px, 4.4vw, 48px)");
    expect(tokens.fontWeights).toMatchObject({ light: "300", strong: "300", medium: "400" });
    expect(tokens.radii).toMatchObject({ control: "4px", card: "6px", feature: "8px" });
    expect(Object.keys(tokens.shadows)).toEqual(["subtle", "ambient", "elevated", "deep"]);
    expect(tokens.shadows.elevated).toBe(
      "rgba(50, 50, 93, 0.25) 0px 30px 45px -30px, rgba(0, 0, 0, 0.1) 0px 18px 36px -18px",
    );
    expect(tokens.containers.page).toBe("1080px");
  });

  it("the generated Tailwind theme is up to date with tokens.json", () => {
    expect(() =>
      execFileSync("node", [resolve(__dirname, "../../scripts/generate-tokens.mjs"), "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
