import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import tokens from "../../src/design/tokens.json";
import { colors, contrast, prod, readRepoFile, ref } from "./helpers";

type Evidence = Record<string, Record<string, Record<string, unknown> | null>>;
const evidence = JSON.parse(readRepoFile("docs/design/evidence/reference-computed-styles.json")) as {
  header_and_chrome: Evidence;
  listing_cards: Evidence;
};

function rgbToHex(value: string): string | null {
  const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function evidenceHexes(): Set<string> {
  const found = new Set<string>();
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      for (const part of node.match(/rgba?\([^)]*\)/g) ?? []) {
        const hex = rgbToHex(part);
        if (hex) found.add(hex);
      }
    } else if (node && typeof node === "object") Object.values(node).forEach(visit);
  };
  visit(evidence);
  return found;
}

// Tokens that exist in the reference's CSS but are not visible in the sampled computed-style states
// (hover, expanded details, success tag, focus ring, overlay). Each is recorded in DESIGN_TOKENS.md.
const CSS_ONLY = new Set([
  "accent-hover",
  "good",
  "good-bg",
  "match-bg",
  "save-on",
  "focus",
  "overlay",
  "secondary-text",
  "check-text",
  "row-hover",
  "border-interest",
  "border-empty",
]);

describe("design tokens (VIS-*, A11Y-06/07/08)", () => {
  it("every reference colour was measured in the reference, or is a documented CSS-only token", () => {
    const measured = evidenceHexes();
    const missing = Object.entries(colors)
      .filter(([name, t]) => t.ref.startsWith("#") && !measured.has(t.ref) && !CSS_ONLY.has(name))
      .map(([name, t]) => `${name} ${t.ref}`);
    expect(missing).toEqual([]);
  });

  it("the only production deviations are DEV-01…DEV-04 and match ACCESSIBILITY_DEVIATIONS.md", () => {
    const deviating = Object.entries(colors).filter(([, t]) => t.prod);
    expect(Object.fromEntries(deviating.map(([n, t]) => [n, t.dev]))).toEqual({
      meta: "DEV-01",
      muted: "DEV-02",
      company: "DEV-03",
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

  it("the DEV-04 control border is the value approved in D-24", () => {
    expect(colors["control-border"]?.prod).toBe("#7693b7");
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

  it("each deviation is the minimum necessary: the reference value really fails, and nothing else fails", () => {
    const failsRef: [string, string, number][] = [
      ["meta", "tag-bg", 4.5],
      ["meta", "row-hover", 4.5],
      ["muted", "surface-notice", 4.5],
      ["company", "row-hover", 4.5],
      ["control-border", "surface", 3],
    ];
    for (const [fg, bg, min] of failsRef) expect(contrast(ref(fg), ref(bg)), `${fg}/${bg}`).toBeLessThan(min);
    // …and the corrected values are close to the reference (imperceptible for the three text colours)
    for (const name of ["meta", "muted", "company"]) {
      const a = ref(name),
        b = prod(name);
      const delta = [1, 3, 5].map((i) =>
        Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)),
      );
      expect(Math.max(...delta), name).toBeLessThanOrEqual(6);
    }
  });

  it("typography and layout tokens equal the measured reference values", () => {
    expect(tokens.fontFamily).toBe("Arial, Helvetica, sans-serif");
    expect(tokens.fontSizes).toMatchObject({
      micro: "10px",
      small: "11px",
      ctl: "12px",
      base: "13px",
      title: "14px",
      section: "17px",
      logo: "25px",
    });
    expect(tokens.fontSizes.hero).toBe("clamp(29px, 3.6vw, 39px)");
    expect(tokens.containers.page).toBe("1190px");
    expect(tokens.heights).toEqual({ control: "33px", field: "36px", search: "39px", avatar: "39px" });
    const header = evidence.header_and_chrome["1440"]?.body as Record<string, string>;
    expect(header.fontFamily).toBe("Arial, Helvetica, sans-serif");
    expect(header.fontSize).toBe("13px");
  });

  it("the generated Tailwind theme is up to date with tokens.json", () => {
    expect(() =>
      execFileSync("node", [resolve(__dirname, "../../scripts/generate-tokens.mjs"), "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
