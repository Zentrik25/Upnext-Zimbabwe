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

describe("flat design guard (VIS-04, D-08)", () => {
  const banned = [
    // D-29: only the control radius token and its square resets are allowed.
    /\brounded(?!-(?:control|none|[rl]-none)(?![\w-]))(?:-[\w[\]./]+)?\b/,
    /\b(?:drop-)?shadow(?:-[\w[\]./]+)?\b/,
    /\bblur(?:-[\w[\]./]+)?\b/,
    /\bbackdrop-[\w-]+\b/,
    /\bbg-(?:gradient|linear|radial|conic)-[\w[\]./-]+/,
    /\b(?:from|via|to)-(?:accent|ink|surface|line)\b/,
  ];

  it("no source file uses rounded, shadow, blur, backdrop or gradient utilities", () => {
    const offenders: string[] = [];
    for (const file of sources.filter((f) => /\.tsx?$/.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of banned) if (pattern.test(text)) offenders.push(`${file}: ${pattern}`);
    }
    expect(offenders).toEqual([]);
  });

  it("global CSS never sets a non-zero radius, a shadow or a gradient", () => {
    const css = readFileSync(join(src, "styles/globals.css"), "utf8");
    expect(css).not.toMatch(/gradient\(/);
    for (const m of css.matchAll(/border-radius:\s*([^;]+);/g))
      expect(["0", "var(--radius-control)"]).toContain(m[1]?.trim());
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) expect(m[1]?.trim()).toBe("none");
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
