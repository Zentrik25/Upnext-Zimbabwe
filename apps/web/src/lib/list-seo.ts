import { CATEGORY_SEO } from "./category-seo";

/** The query keys the list page reads. Anything else (utm_*, fbclid, …) does not change the page and is ignored. */
export const LIST_KEYS = [
  "q",
  "category",
  "location",
  "employment_type",
  "work_mode",
  "deadline_state",
  "sort",
  "limit",
] as const;

type Raw = Record<string, string | string[] | undefined>;

export type ListView =
  | { kind: "plain"; index: true; canonical: "/opportunities" }
  | { kind: "category"; index: true; canonical: string; category: string }
  | { kind: "paged" | "refined"; index: false; canonical: string; category?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The known category a malformed `category` value was meant to be, or undefined. Crawlers have requested
 * `category=jobsJobs` and `category=tendersTenders`: a category's code and its display name run together, as when a
 * form's `<select>` options (value "jobs", text "Jobs") are read as one string. A value is repaired only when it is
 * the code in another letter case, or the code twice (the code, then the name, which is the code in every
 * launch category: spaces and hyphens ignored). Anything else stays an unknown filter.
 */
export function repairCategory(value: string): string | undefined {
  const flat = squash(value);
  return Object.keys(CATEGORY_SEO).find(
    (code) => flat === squash(code) || flat === squash(code) + squash(code),
  );
}

/** The literal template token of the schema.org search-action example; no visitor types it. */
const TEMPLATE_TOKEN = /search_term_string/i;

/**
 * The clean address a request for the list page must be sent to with a permanent redirect, or null when the address
 * is fine. Two kinds of bad address are repaired: a malformed category (`repairCategory`) and an unfilled search
 * template (`q={search_term_string}`, whose search words are dropped). Parameters the page does not read are dropped
 * too. A repaired address is never indexed itself: its 301 hands the crawler the clean list.
 */
export function repairedListAddress(raw: Raw): string | null {
  const used = new Map<string, string>();
  for (const key of [...LIST_KEYS, "cursor"]) {
    const value = first(raw[key]);
    if (value !== undefined && value !== "") used.set(key, value);
  }
  let changed = false;
  const category = used.get("category");
  if (category !== undefined && !Object.hasOwn(CATEGORY_SEO, category)) {
    const code = repairCategory(category);
    if (code) {
      used.set("category", code);
      changed = true;
    }
  }
  const q = used.get("q");
  if (q !== undefined && TEMPLATE_TOKEN.test(q)) {
    used.delete("q");
    changed = true;
  }
  if (!changed) return null;
  const query = new URLSearchParams();
  for (const key of [...LIST_KEYS, "cursor"]) if (used.has(key)) query.set(key, used.get(key)!);
  const text = query.toString();
  return text ? `/opportunities?${text}` : "/opportunities";
}

/**
 * How search engines should treat one address of the list page:
 *  - the plain list, and a list of exactly one known category, are indexable and canonical to themselves;
 *  - a page after the first (`cursor`) is its own page: noindex, follow, canonical to itself, never to page one;
 *  - any other combination (search words, filters, sorting, page size) is a view of the same listings: noindex,
 *    follow, canonical to the nearest indexable list (the category's, or the plain list);
 *  - parameters the page does not read are dropped from the canonical address.
 */
export function classifyList(raw: Raw): ListView {
  const used = new Map<string, string>();
  for (const key of [...LIST_KEYS, "cursor"]) {
    const value = first(raw[key]);
    if (value !== undefined && value !== "") used.set(key, value);
  }
  const category = used.get("category");
  const known = category !== undefined && Object.hasOwn(CATEGORY_SEO, category) ? category : undefined;
  const categoryAddress = known ? `/opportunities?category=${known}` : "/opportunities";
  if (used.size === 0) return { kind: "plain", index: true, canonical: "/opportunities" };
  if (used.size === 1 && known)
    return { kind: "category", index: true, canonical: categoryAddress, category: known };
  if (used.has("cursor")) {
    const query = new URLSearchParams([...used.entries()].sort(([a], [b]) => a.localeCompare(b)));
    return { kind: "paged", index: false, canonical: `/opportunities?${query.toString()}`, category: known };
  }
  return { kind: "refined", index: false, canonical: categoryAddress, category: known };
}
