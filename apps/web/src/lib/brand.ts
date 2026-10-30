/**
 * The public identity: UPNEXT Careers (owner decision D-42, which supersedes the UPNEXT Careers naming of D-33).
 * This is the one place display text, the official contact address and the approved domain are written down.
 * The public ADDRESS of a running site is configuration (`UPNEXT_PUBLIC_BASE_URL`, see site.ts) so a development
 * or preview build never claims the production domain; `canonicalOrigin` is the value production must use.
 * Internal identifiers (environment variable names, cookie names, package names, Django apps) keep their
 * historical `upnext` spelling on purpose: renaming them would be risky and no visitor can see them.
 */
export const BRAND = {
  /** Full public name: titles, metadata, e-mail, structured data. */
  name: "UPNEXT Careers",
  /** Short name: tight spaces and running text. */
  short: "UPNEXT",
  /** The descriptor shown beneath the name in the wordmark. */
  descriptor: "Careers",
  /** Previous development name, kept for documentation and redirects only. Never shown to visitors. */
  formerName: "UPNEXT Careers",
  /** https://upnext.co.zw is the only public and canonical website. No other hostname or redirect is configured. */
  domain: "upnext.co.zw",
  canonicalOrigin: "https://upnext.co.zw",
  /** The only official mailbox: contact, privacy and every system e-mail (sender name + reply-to). */
  email: "info@upnext.co.zw",
  tagline: "Jobs and opportunities in Zimbabwe.",
  /** Homepage `<title>` (exact text approved by the owner). */
  homeTitle: "UPNEXT Careers | Jobs & Opportunities in Zimbabwe",
  /** Homepage description (exact text approved by the owner); other pages use `description`. */
  homeDescription:
    "Discover jobs and career opportunities in Zimbabwe with UPNEXT Careers. Explore vacancies, internships and other opportunities from trusted sources.",
  description:
    "Jobs, internships, graduate programmes, scholarships, tenders and grants in Zimbabwe, each with its source named.",
  /** Static brand files (public/brand). */
  assets: {
    ogImage: "/brand/og-image.png",
    favicon32: "/brand/favicon-32.png",
    favicon16: "/brand/favicon-16.png",
    appleTouchIcon: "/brand/apple-touch-icon.png",
    icon192: "/brand/icon-192.png",
    icon512: "/brand/icon-512.png",
    iconMaskable: "/brand/icon-maskable-512.png",
  },
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
    images: [
      {
        url: BRAND.assets.ogImage,
        width: 1200,
        height: 630,
        alt: `${BRAND.name}: jobs and opportunities in Zimbabwe`,
      },
    ],
  };
}

/** Twitter/X card for a page. Like `openGraph`, Next.js replaces the layout's `twitter` block as a whole, so a page
 *  that sets its own Open Graph title must set the card too, or the card keeps the site-wide title. */
export function twitterFor(extra: { title?: string; description?: string } = {}) {
  return {
    card: "summary_large_image" as const,
    title: extra.title ?? BRAND.name,
    description: extra.description ?? BRAND.description,
    images: [BRAND.assets.ogImage],
  };
}

/** Open Graph and Twitter blocks together, from the same title and description (spread into `Metadata`). */
export function socialFor(url: string, extra: { title?: string; description?: string } = {}) {
  return { openGraph: openGraphFor(url, extra), twitter: twitterFor(extra) };
}
