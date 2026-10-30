import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import tokens from "../../src/design/tokens.json";
import { colors, contrast, dark, prod, readRepoFile, ref } from "./helpers";

describe("design tokens (VIS-*, A11Y-06/07/08)", () => {
  it("the colour tokens equal the Stripe design system palette (D-45)", () => {
    expect(
      Object.fromEntries(
        Object.entries(colors)
          .filter(([n]) =>
            [
              "ink",
              "muted",
              "accent",
              "accent-hover",
              "accent-solid",
              "line",
              "brand-dark",
              "surface",
              "surface-pale",
              "check-text",
              "border-strong",
              "border-interest",
              "border-empty",
              "ruby",
              "magenta",
            ].includes(n),
          )
          .map(([n, t]) => [n, t.ref]),
      ),
    ).toEqual({
      ink: "#061b31",
      muted: "#64748d",
      accent: "#533afd",
      "accent-hover": "#4434d4",
      "accent-solid": "#533afd",
      line: "#e5edf5",
      "brand-dark": "#1c1e54",
      surface: "#ffffff",
      "surface-pale": "#f6f9fc",
      "check-text": "#273951",
      "border-strong": "#b9b9f9",
      "border-interest": "#d6d9fc",
      "border-empty": "#362baa",
      ruby: "#ea2261",
      magenta: "#f96bee",
    });
  });

  it("the dark theme equals the owner's dark preview (D-45)", () => {
    expect(dark("surface")).toBe("#0e0f2e");
    expect(dark("ink")).toBe("#e8ecf0");
    expect(dark("muted")).toBe("#8a95a8");
    expect(dark("accent-solid")).toBe("#665efd");
    expect(dark("accent")).toBe("#b9b9f9");
    expect(dark("brand-dark")).toBe("#1c1e54");
    expect(dark("good")).toBe("#4cdf80");
    expect(dark("urgent")).toBe("#d4a04a");
  });

  it("the only production deviations are DEV-02…DEV-06 and match ACCESSIBILITY_DEVIATIONS.md", () => {
    const deviating = Object.entries(colors).filter(([, t]) => t.prod);
    expect(new Set(deviating.map(([, t]) => t.dev))).toEqual(
      new Set(["DEV-02", "DEV-03", "DEV-04", "DEV-05", "DEV-06"]),
    );
    expect(Object.fromEntries(deviating.map(([n, t]) => [n, t.dev]))).toMatchObject({
      good: "DEV-02",
      urgent: "DEV-03",
      "control-border": "DEV-04",
      muted: "DEV-05",
      danger: "DEV-06",
    });
    const doc = readRepoFile("docs/design/ACCESSIBILITY_DEVIATIONS.md");
    for (const [name, t] of deviating) {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${t.dev} `));
      expect(row, `${t.dev} row for ${name}`).toBeDefined();
      expect(row).toContain(t.prod);
      expect(row).toContain(t.ref);
    }
  });

  it("the DEV-04 control border is the corrected value (the design system's slate)", () => {
    expect(colors["control-border"]?.prod).toBe("#64748d");
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
      ["danger", "surface", 4.5],
      ["danger", "danger-bg", 4.5],
      ["muted", "match-bg", 4.5],
      ["ink", "match-bg", 4.5],
      ["accent", "match-bg", 4.5],
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
      ["muted", "surface-pale", 4.5],
      ["danger", "surface", 4.5],
    ];
    for (const [fg, bg, min] of failsRef) {
      expect(contrast(ref(fg), ref(bg)), `${fg}/${bg} (design system)`).toBeLessThan(min);
      expect(contrast(prod(fg), prod(bg)), `${fg}/${bg} (corrected)`).toBeGreaterThanOrEqual(min);
    }
  });

  it("typography, radius, shadow and layout tokens equal the Stripe design system (D-45)", () => {
    expect(tokens.fontFamily).toMatch(/^var\(--font-inter\), "Inter"/);
    expect(tokens.fontMono).toMatch(/^var\(--font-source-code\), "Source Code Pro"/);
    expect(tokens.fontSizes).toMatchObject({
      base: "16px",
      lead: "18px",
      title: "20px",
      sub: "24px",
      section: "28px",
      display: "clamp(28px, 3.6vw, 40px)",
      hero: "clamp(32px, 5vw, 52px)",
    });
    expect(tokens.tracking).toMatchObject({
      hero: "-1.4px",
      display: "-0.96px",
      section: "-0.64px",
      sub: "-0.26px",
      title: "-0.22px",
    });
    expect(tokens.leading).toMatchObject({ body: "1.4", hero: "1.03", display: "1.15" });
    // Weight 300 is the voice; 400 is for buttons, links and navigation; nothing heavier in the primary font.
    expect(tokens.fontWeights).toMatchObject({ light: "300", medium: "400", strong: "400", bold: "400" });
    expect(tokens.radii).toMatchObject({
      micro: "1px",
      control: "4px",
      standard: "5px",
      card: "6px",
      feature: "8px",
    });
    expect(Object.keys(tokens.shadows)).toEqual(["subtle", "ambient", "elevated", "deep"]);
    expect(tokens.shadows).toMatchObject({
      subtle: "rgba(23, 23, 23, 0.06) 0px 3px 6px 0px",
      ambient: "rgba(23, 23, 23, 0.08) 0px 15px 35px 0px",
      elevated: "rgba(50, 50, 93, 0.25) 0px 30px 45px -30px, rgba(0, 0, 0, 0.1) 0px 18px 36px -18px",
      deep: "rgba(3, 3, 39, 0.25) 0px 14px 21px -14px, rgba(0, 0, 0, 0.1) 0px 8px 17px -8px",
    });
    expect(tokens.darkShadows.elevated).toBe(
      "rgba(0, 0, 0, 0.4) 0px 30px 45px -30px, rgba(0, 0, 0, 0.3) 0px 18px 36px -18px",
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
      ["danger", "surface"],
      ["danger", "danger-bg"],
      ["ink", "match-bg"],
      ["muted", "match-bg"],
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
