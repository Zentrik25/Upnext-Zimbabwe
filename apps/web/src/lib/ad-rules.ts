import type { AdPlacement } from "./adsense";

/**
 * Where an advertisement may appear. An ALLOW-LIST: a page not matched here can never show an ad, even if someone
 * drops an <AdSlot> into it (the slot re-checks the real request path). Only substantial, public, read-only content
 * qualifies: a single published opportunity and an editorial guide.
 *
 * Never allowed (kept as tests, tests/unit/ad-rules.test.ts): sign-in, registration and password pages, the account,
 * saved, dashboard, alerts, profile and For you pages, the employer portal, the staff workspace, the report form,
 * the privacy, terms and contact pages, the home page and the search results list.
 */
const RULES: readonly { placement: AdPlacement; matches: RegExp }[] = [
  // /opportunities/<slug> only: not the list, not /opportunities/<slug>/report.
  { placement: "job-detail", matches: /^\/opportunities\/[^/]+\/?$/ },
  // /guides/<guide> only.
  { placement: "guide", matches: /^\/guides\/[^/]+\/?$/ },
];

/** The placement a path allows, or undefined when no ad may appear on it. */
export function placementForPath(pathname: string): AdPlacement | undefined {
  return RULES.find((rule) => rule.matches.test(pathname))?.placement;
}

export const adAllowedOn = (placement: AdPlacement, pathname: string): boolean =>
  placementForPath(pathname) === placement;

export const isAdEligiblePath = (pathname: string): boolean => placementForPath(pathname) !== undefined;
