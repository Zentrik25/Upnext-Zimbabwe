/**
 * The three editorial guides (DRAFT until the owner approves the wording, D-51). One list feeds the pages, the
 * sitemap, the footer and the related-links block, so an address cannot be linked without being listed. Dates are the
 * dates the text was written and last changed; change `dateModified` only when the text meaningfully changes.
 */
export const GUIDES = [
  {
    path: "/guides/how-to-find-jobs-in-zimbabwe",
    title: "How to find jobs in Zimbabwe",
    description:
      "How to search UPNEXT Careers by category, keyword and location, read a listing, and save opportunities to come back to.",
    datePublished: "2026-10-30",
    dateModified: "2026-10-30",
  },
  {
    path: "/guides/apply-safely-and-avoid-scams",
    title: "How to apply safely and avoid recruitment scams",
    description:
      "Warning signs of a fake vacancy, how to check an opportunity with the issuer, and what to do if something looks wrong.",
    datePublished: "2026-10-30",
    dateModified: "2026-10-30",
  },
  {
    path: "/guides/how-listings-are-verified",
    title: "How UPNEXT Careers checks and verifies listings",
    description:
      "Where listings come from, how they are reviewed before they are public, what each verification label means, and how to report or correct a listing.",
    datePublished: "2026-10-30",
    dateModified: "2026-10-30",
  },
] as const;

export const GUIDE_PATHS = GUIDES.map((g) => g.path) as unknown as readonly (typeof GUIDES)[number]["path"][];

export function guideAt(path: (typeof GUIDES)[number]["path"]) {
  return GUIDES.find((g) => g.path === path)!;
}
