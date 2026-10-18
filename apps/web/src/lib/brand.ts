/**
 * The public identity (owner decision D-33). Display text only: the public ADDRESS of the site is configuration
 * (`UPNEXT_PUBLIC_BASE_URL`, see site.ts), so the canonical domain is never hard-coded in pages.
 * Internal identifiers (environment variable names, cookie names, package names) keep their historical
 * `upnext` spelling on purpose: renaming them would be a risky change that no visitor can see.
 */
export const BRAND = {
  name: "NextJob Zimbabwe",
  short: "NextJob",
  tagline: "Find what's next.",
  /** The domain the owner approved for the launch; used in documentation and examples, not for links. */
  approvedDomain: "nextjob.co.zw",
  description:
    "Find what's next: jobs, internships, graduate programmes, scholarships, tenders and grants in Zimbabwe.",
} as const;

/** Open Graph block for a page. Next.js replaces (does not merge) `openGraph`, so every page repeats the site fields. */
export function openGraphFor(url: string, extra: { title?: string; description?: string } = {}) {
  return {
    siteName: BRAND.name,
    type: "website" as const,
    locale: "en",
    url,
    title: extra.title ?? BRAND.name,
    description: extra.description ?? BRAND.description,
  };
}
