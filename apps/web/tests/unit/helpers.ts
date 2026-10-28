import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tokens from "../../src/design/tokens.json";

// Compose mounts the repository at /repo (UPNEXT_REPO_ROOT); on a host checkout it is four levels up.
export const repoRoot = process.env.UPNEXT_REPO_ROOT ?? resolve(__dirname, "../../../..");
export const readRepoFile = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

export type TokenColor = { ref: string; prod?: string; dev?: string; dark: string };
export const colors = tokens.colors as Record<string, TokenColor>;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Production colour for a token name ("white" is the literal #ffffff). */
export function prod(name: string): string {
  if (name === "white") return "#ffffff";
  const token = colors[name];
  if (!token) throw new Error(`unknown token ${name}`);
  return token.prod ?? token.ref;
}

export function ref(name: string): string {
  if (name === "white") return "#ffffff";
  const token = colors[name];
  if (!token) throw new Error(`unknown token ${name}`);
  return token.ref;
}

/** Dark-theme colour for a token name ("white" is the literal #ffffff). */
export function dark(name: string): string {
  if (name === "white") return "#ffffff";
  const token = colors[name];
  if (!token) throw new Error(`unknown token ${name}`);
  return token.dark;
}
