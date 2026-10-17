import { expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tokens from "../../src/design/tokens.json";

type Style = Record<string, string | number[] | undefined>;
type Evidence = Record<string, Record<string, Style | null>>;
const raw = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../docs/design/evidence/reference-computed-styles.json"), "utf8"),
) as { header_and_chrome: Evidence; listing_cards: Evidence };

/** Computed style of an element of the approved reference at 1440px (docs/design/evidence). */
export function reference(group: "header_and_chrome" | "listing_cards", key: string): Style {
  const node = raw[group]["1440"]?.[key];
  if (!node) throw new Error(`no reference evidence for ${group}/${key}`);
  return node;
}

export function rgb(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

type Colors = Record<string, { ref: string; prod?: string }>;
const colors = tokens.colors as Colors;
/** Production colour (post accessibility deviation) as the browser reports it. */
export const prodRgb = (name: string) => rgb(colors[name]?.prod ?? colors[name]!.ref);
export const refRgb = (name: string) => rgb(colors[name]!.ref);

export const BOX_KEYS = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderTopLeftRadius",
  "boxShadow",
] as const;
export const TEXT_KEYS = ["fontSize", "fontWeight", "letterSpacing", "lineHeight"] as const;
export const COLOR_KEYS = ["color", "backgroundColor"] as const;
type Key = (typeof BOX_KEYS)[number] | (typeof TEXT_KEYS)[number] | (typeof COLOR_KEYS)[number] | string;

/**
 * Asserts that a built element has the same computed style as the reference element for `keys`,
 * except where `overrides` names an approved deviation (DEV-01…DEV-04) or an intentional difference.
 */
export async function expectMatchesReference(
  locator: Locator,
  expected: Style,
  keys: readonly Key[],
  overrides: Record<string, string> = {},
) {
  const actual = await locator.evaluate((el, ks) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(ks.map((k) => [k, (cs as unknown as Record<string, string>)[k]]));
  }, keys as string[]);
  for (const key of keys) {
    const want = overrides[key] ?? (expected[key] as string | undefined);
    if (want === undefined) continue;
    expect(actual[key], `${key}`).toBe(want);
  }
}
