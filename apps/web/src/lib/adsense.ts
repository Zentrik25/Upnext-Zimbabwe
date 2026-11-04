/**
 * Google AdSense configuration (owner request, 2026-11-03; DRAFT, see docs/engineering/ADSENSE_SITE_VERIFICATION.md).
 *
 * EVERYTHING HERE IS OFF BY DEFAULT. Advertising is a recorded non-goal (PRD, P4-04), so nothing loads or renders
 * until the owner sets, in the deployed environment:
 *   UPNEXT_ADSENSE_CLIENT  the real publisher id (`ca-pub-…`) from the owner's AdSense account. On its own it only makes
 *                          /ads.txt available (app/ads.txt/route.ts); no Google script loads and no ad shows
 *   UPNEXT_ADSENSE_MODE    `verify` (site-ownership snippet only, no ads) or `live` (labelled ads after consent)
 *   UPNEXT_ADSENSE_SLOT_*  one real ad-unit id per placement, created in AdSense after approval
 * No publisher id or slot id is written in this repository.
 */
export type AdMode = "off" | "verify" | "live";
export type AdPlacement = "job-detail" | "guide";

type Env = Record<string, string | undefined>;

const PUBLISHER_ID = /^ca-pub-\d{10,20}$/;
const SLOT_ID = /^\d{6,20}$/;

/** The AdSense publisher id (`ca-pub-…`) from the environment, or undefined when unset or malformed. */
export function adsenseClient(env: Env = process.env): string | undefined {
  const value = env.UPNEXT_ADSENSE_CLIENT?.trim();
  return value && PUBLISHER_ID.test(value) ? value : undefined;
}

/**
 * `off` unless a well-formed publisher id AND an explicit mode are both present. `verify` loads Google's snippet on
 * public pages so AdSense can find it (no ads, no consent gate, because the crawler must see it in the page);
 * `live` loads nothing until the visitor agrees, then shows labelled ads in the allowed placements only.
 */
export function adsenseMode(env: Env = process.env): AdMode {
  if (!adsenseClient(env)) return "off";
  const mode = env.UPNEXT_ADSENSE_MODE?.trim().toLowerCase();
  return mode === "verify" || mode === "live" ? mode : "off";
}

const SLOT_VARIABLE: Record<AdPlacement, string> = {
  "job-detail": "UPNEXT_ADSENSE_SLOT_JOB_DETAIL",
  guide: "UPNEXT_ADSENSE_SLOT_GUIDE",
};

/** The real ad-unit id for a placement, or undefined (the placement then renders nothing). */
export function adSlotId(placement: AdPlacement, env: Env = process.env): string | undefined {
  const value = env[SLOT_VARIABLE[placement]]?.trim();
  return value && SLOT_ID.test(value) ? value : undefined;
}

/**
 * The one line of /ads.txt that authorises Google to sell this site's advertising: Google's domain, the publisher id
 * WITHOUT the `ca-` prefix, the relationship, and Google's fixed certification-authority id (f08c47fec0942fa0, as
 * printed by AdSense; confirm it against the snippet in the owner's AdSense account before relying on it).
 */
export const adsTxtFor = (client: string): string =>
  `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;

export const adsenseScriptSrc = (client: string): string =>
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;

/**
 * Extra Content-Security-Policy sources, added by proxy.ts only in `live` mode and only for a path that may show an
 * ad (ad-rules.ts), so every other page keeps the strict policy. Google's published guidance; it must be confirmed
 * against real AdSense output before activation (ADSENSE_SITE_VERIFICATION.md). Ad creatives come from many hosts,
 * hence `https:` for images on those pages only.
 */
export function adsCspExtra(
  pathname: string,
  isEligiblePath: (pathname: string) => boolean,
  env: Env = process.env,
): Record<string, string[]> {
  if (adsenseMode(env) !== "live" || !isEligiblePath(pathname)) return {};
  return {
    "script-src": [
      "https://pagead2.googlesyndication.com",
      "https://tpc.googlesyndication.com",
      "https://partner.googleadservices.com",
    ],
    "img-src": ["https:"],
    "frame-src": [
      "https://googleads.g.doubleclick.net",
      "https://tpc.googlesyndication.com",
      "https://www.google.com",
    ],
    "connect-src": ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net"],
  };
}
