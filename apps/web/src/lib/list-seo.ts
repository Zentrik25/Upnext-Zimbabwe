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
