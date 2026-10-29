import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const src = resolve(__dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}
const sources = files(src).filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith("tokens.generated.css"));

describe("design system guard (VIS-04, D-39, D-45)", () => {
  const banned = [
    // Radii come only from the token scale: micro 1px, control 4px, standard 5px, card 6px, feature 8px. No pills, no arbitrary radii.
    /\brounded(?!-(?:none|micro|control|standard|card|feature|[rltb]-(?:none|micro|control|standard|card|feature))(?![\w-]))(?:-[\w[\]./]+)?\b/,
    // Shadows come only from the four design-system levels (subtle, ambient, elevated, deep).
    /\b(?:drop-)?shadow(?!-(?:subtle|ambient|elevated|deep|none)(?![\w-]))(?:-[\w[\]./]+)?\b/,
    /\bbg-(?:gradient|radial|conic)-[\w[\]./-]+/,
    // The only gradient is the decorative ruby to magenta accent.
    /\b(?:from|via|to)-(?!(?:ruby|magenta)\b)(?:accent|ink|surface|line|brand-dark)\b/,
  ];

  it("no source file uses a radius, shadow or gradient outside the design-system tokens", () => {
    const offenders: string[] = [];
    for (const file of sources.filter((f) => /\.tsx?$/.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of banned) if (pattern.test(text)) offenders.push(`${file}: ${pattern}`);
    }
    expect(offenders).toEqual([]);
  });

  it("global CSS only uses the control radius token, no raw shadows and no gradients", () => {
    const css = readFileSync(join(src, "styles/globals.css"), "utf8");
    expect(css).not.toMatch(/gradient\(/);
    for (const m of css.matchAll(/border-radius:\s*([^;]+);/g))
      expect(m[1]?.trim()).toBe("var(--radius-control)");
    expect(css).not.toMatch(/box-shadow:/);
  });

  it("keeps in-page targets clear of the sticky header (SC 2.4.11)", () => {
    const css = readFileSync(join(src, "styles/globals.css"), "utf8");
    expect(css).toMatch(/scroll-padding-top:\s*5\.5rem/);
  });

  it("application code never uses the reference-only colour tokens (they exist for tests)", () => {
    const offenders = sources.filter((f) =>
      /(?:text|bg|border|fill|stroke)-ref-/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no dependency-provided UI theme or component library is imported", () => {
    const offenders = sources.filter((f) =>
      /from ["'](?:@mui|@chakra-ui|antd|@radix-ui|@headlessui|daisyui)/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
