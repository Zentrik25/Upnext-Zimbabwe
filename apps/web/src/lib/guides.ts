/**
 * The editorial guides (DRAFT until the owner approves the wording, D-51). One list feeds the pages, the
 * sitemap, the footer and the related-links block, so an address cannot be linked without being listed. Dates are the
 * dates the text was written and last changed (the D-67 wording changes of 2026-11-03 are the latest); change
 * `dateModified` only when the text meaningfully changes. The sitemap uses `dateModified` as the guide's `lastmod`.
 */
export const GUIDES = [
  {
    path: "/guides/how-to-find-jobs-in-zimbabwe",
    title: "How to find jobs in Zimbabwe",
    description:
      "How to search UPNEXT Careers by category, keyword and location, read a listing, and save opportunities to come back to.",
    datePublished: "2026-10-30",
    dateModified: "2026-11-03",
  },
  {
    path: "/guides/apply-safely-and-avoid-scams",
    title: "How to apply safely and avoid recruitment scams",
    description:
      "Warning signs of a fake vacancy, how to check an opportunity with the issuer, and what to do if something looks wrong.",
    datePublished: "2026-10-30",
    dateModified: "2026-11-03",
  },
  {
    path: "/guides/how-listings-are-verified",
    title: "How UPNEXT Careers checks and verifies listings",
    description:
      "How listings are reviewed before they are public, what each verification label means, and how to report or correct a listing.",
    datePublished: "2026-10-30",
    dateModified: "2026-11-03",
  },
  {
    path: "/guides/how-to-apply-for-graduate-trainee-programmes",
    title: "How to apply for graduate trainee programmes",
    description:
      "What graduate trainee programmes usually involve, how to read the eligibility rules, and how to prepare a complete application before the closing date.",
    datePublished: "2026-11-10",
    dateModified: "2026-11-10",
  },
  {
    path: "/guides/how-to-prepare-a-cv",
    title: "How to prepare a CV for employers in Zimbabwe",
    description:
      "How to structure a clear CV, match it to a listing, present qualifications and referees honestly, and send it in the form the employer asks for.",
    datePublished: "2026-11-10",
    dateModified: "2026-11-10",
  },
  {
    path: "/guides/finding-engineering-internships-and-attachments",
    title: "Where to find engineering internships and attachments",
    description:
      "Where engineering internships and industrial attachments are advertised, how to search for them on UPNEXT Careers, and how to approach employers directly.",
    datePublished: "2026-11-10",
    dateModified: "2026-11-10",
  },
] as const;

export const GUIDE_PATHS = GUIDES.map((g) => g.path) as unknown as readonly (typeof GUIDES)[number]["path"][];

export function guideAt(path: (typeof GUIDES)[number]["path"]) {
  return GUIDES.find((g) => g.path === path)!;
}
