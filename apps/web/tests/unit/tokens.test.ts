import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import tokens from "../../src/design/tokens.json";
import { colors, contrast, dark, prod, readRepoFile, ref } from "./helpers";

describe("design tokens (VIS-*, A11Y-06/07/08)", () => {
  it("the colour tokens equal the UPNEXT Careers monochrome palette (D-42)", () => {
    expect(
      Object.fromEntries(
        Object.entries(colors)
          .filter(([n]) =>
            ["ink", "accent", "accent-hover", "line", "brand-dark", "surface-pale", "muted"].includes(n),
          )
          .map(([n, t]) => [n, t.ref]),
      ),
    ).toEqual({
      ink: "#101828",
      muted: "#475467",
      accent: "#000000",
      "accent-hover": "#1d2939",
      line: "#e4e7ec",
      "surface-pale": "#f8fafc",
      "brand-dark": "#000000",
    });
  });

  it("the only production deviations are DEV-02…DEV-04 (DEV-01 retired by D-42) and match ACCESSIBILITY_DEVIATIONS.md", () => {
    const deviating = Object.entries(colors).filter(([, t]) => t.prod);
    expect(new Set(deviating.map(([, t]) => t.dev))).toEqual(new Set(["DEV-02", "DEV-03", "DEV-04"]));
    expect(Object.fromEntries(deviating.map(([n, t]) => [n, t.dev]))).toMatchObject({
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
    expect(colors["control-border"]?.prod).toBe("#667085");
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
    expect(tokens.fontFamily).toMatch(/^var\(--font-inter\), "Inter"/);
    expect(tokens.fontSizes.hero).toBe("clamp(36px, 5.2vw, 60px)");
    expect(tokens.fontWeights).toMatchObject({ light: "400", strong: "600", medium: "600" });
    expect(tokens.radii).toMatchObject({ control: "4px", card: "6px", feature: "8px" });
    expect(Object.keys(tokens.shadows)).toEqual(["subtle", "ambient", "elevated", "deep"]);
    expect(tokens.shadows.elevated).toBe(
      "rgba(16, 24, 40, 0.18) 0px 30px 45px -30px, rgba(0, 0, 0, 0.08) 0px 18px 36px -18px",
    );
    expect(tokens.containers.page).toBe("1080px");
  });

  it("every colour token has a dark value; dark applies only on an explicit choice, never from the device setting (D-40)", () => {
    for (const [name, t] of Object.entries(colors)) expect(t.dark, name).toBeTruthy();
    const css = readRepoFile("apps/web/src/styles/tokens.generated.css");
    expect(css).toContain(':root[data-theme="dark"] {');
    expect(css).not.toContain("prefers-color-scheme");
    expect(css.match(/color-scheme: dark;/g)).toHaveLength(1);
    expect(Object.keys(tokens.darkShadows)).toEqual(Object.keys(tokens.shadows));
  });

  it("dark text pairs meet WCAG 2.2 AA (A11Y-06)", () => {
    const pairs: [string, string][] = [
      ["ink", "surface"],
      ["ink", "surface-pale"],
      ["ink", "row-hover"],
      ["muted", "surface"],
      ["muted", "surface-notice"],
      ["muted", "surface-pale"],
      ["muted", "row-hover"],
      ["meta", "tag-bg"],
      ["company", "row-hover"],
      ["accent", "surface"],
      ["accent", "surface-pale"],
      ["accent", "match-bg"],
      ["on-accent", "accent-solid"],
      ["on-accent", "accent-solid-hover"],
      ["secondary-text", "surface"],
      ["nav-text", "surface"],
      ["eyebrow", "surface"],
      ["tab-text", "surface"],
      ["feed-tab-text", "surface"],
      ["check-text", "surface"],
      ["empty-text", "surface"],
      ["good", "good-bg"],
      ["urgent", "urgent-bg"],
      ["urgent", "surface"],
      ["avatar-text", "avatar-bg"],
      ["brand-dark-text", "brand-dark"],
    ];
    const failing = pairs
      .filter(([fg, bg]) => contrast(dark(fg), dark(bg)) < 4.5)
      .map(([a, b]) => `${a}/${b}`);
    expect(failing).toEqual([]);
  });

  it("dark non-text pairs meet 3:1 (A11Y-07)", () => {
    const pairs: [string, string][] = [
      ["control-border", "surface"],
      ["control-border", "surface-pale"],
      ["focus", "surface"],
      ["focus", "surface-pale"],
      ["save-on", "surface"],
      ["save-idle", "surface"],
      ["border-empty", "surface"],
    ];
    const failing = pairs.filter(([a, b]) => contrast(dark(a), dark(b)) < 3).map(([a, b]) => `${a}/${b}`);
    expect(failing).toEqual([]);
  });

  it("the light solid button pairs still pass", () => {
    expect(contrast("#ffffff", prod("accent-solid"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", prod("accent-solid-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the generated Tailwind theme is up to date with tokens.json", () => {
    expect(() =>
      execFileSync("node", [resolve(__dirname, "../../scripts/generate-tokens.mjs"), "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
