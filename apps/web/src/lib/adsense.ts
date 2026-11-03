/**
 * Google AdSense site-verification snippet (owner request, 2026-11-03; DRAFT, see
 * docs/engineering/ADSENSE_SITE_VERIFICATION.md).
 *
 * OFF BY DEFAULT. The script is rendered only when `UPNEXT_ADSENSE_CLIENT` holds a well-formed publisher id,
 * so a deployment that does not set it makes no request to Google. Advertising is a recorded non-goal
 * (PRD, P4-04), so turning this on needs the owner's explicit decision and reviewed privacy text (B-02).
 */
const PUBLISHER_ID = /^ca-pub-\d{10,20}$/;

/** The AdSense publisher id (`ca-pub-…`) from the environment, or undefined when unset or malformed. */
export function adsenseClient(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env.UPNEXT_ADSENSE_CLIENT?.trim();
  return value && PUBLISHER_ID.test(value) ? value : undefined;
}

export const adsenseScriptSrc = (client: string): string =>
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
