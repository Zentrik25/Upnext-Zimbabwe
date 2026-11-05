/**
 * The eight priority destinations for branded search (owner instruction 2026-11-05, D-69). They are the pages a
 * person searching for "UPNEXT Careers" most likely wants, so every one is linked with a descriptive, crawlable HTML
 * link from the footer of every public page (and so from the home page), and the opportunity lists also from the
 * header menus. Google alone decides whether, and which, sitelinks appear: this list only makes the site's
 * hierarchy clear.
 *
 * Seven are ordinary public pages: indexable, self-canonical and in the sitemap (a category list only while it holds
 * an open listing, D-51). Sign In is deliberately different (P4-02, owner instruction): it is linked, but stays
 * `noindex`, blocked in robots.txt and out of the sitemap.
 */
export type Destination = { label: string; href: string; indexable: boolean };

export const PRIORITY_DESTINATIONS: readonly Destination[] = [
  { label: "Jobs & opportunities in Zimbabwe", href: "/opportunities", indexable: true },
  { label: "Latest jobs", href: "/opportunities?category=jobs", indexable: true },
  { label: "Latest tenders", href: "/opportunities?category=tenders", indexable: true },
  { label: "Internships & attachments", href: "/opportunities?category=internships", indexable: true },
  {
    label: "Graduate trainee programmes",
    href: "/opportunities?category=graduate-programmes",
    indexable: true,
  },
  { label: "Scholarships & fellowships", href: "/opportunities?category=scholarships", indexable: true },
  { label: "For employers", href: "/employers", indexable: true },
  { label: "Sign in", href: "/sign-in", indexable: false },
];

/** The six opportunity destinations, in the order the footer lists them. */
export const OPPORTUNITY_DESTINATIONS = PRIORITY_DESTINATIONS.filter((d) =>
  d.href.startsWith("/opportunities"),
);
