import { GUIDES } from "@/lib/guides";

type GuidePath = (typeof GUIDES)[number]["path"];

/**
 * The published guides that help with each category, most useful first (D-74). Only existing, published guides are
 * named, so a link never leads to an unreviewed draft; the plain list gets the general ones. Every list also links the
 * safety guide, because applying safely matters for every category.
 */
const SAFE: GuidePath = "/guides/apply-safely-and-avoid-scams";
const VERIFIED: GuidePath = "/guides/how-listings-are-verified";

export const CATEGORY_GUIDES: Record<string, GuidePath[]> = {
  jobs: ["/guides/how-to-find-jobs-in-zimbabwe", "/guides/how-to-prepare-a-cv", SAFE],
  internships: [
    "/guides/finding-engineering-internships-and-attachments",
    "/guides/how-to-prepare-a-cv",
    SAFE,
  ],
  "graduate-programmes": [
    "/guides/how-to-apply-for-graduate-trainee-programmes",
    "/guides/how-to-prepare-a-cv",
    SAFE,
  ],
  scholarships: [SAFE, VERIFIED],
  tenders: [SAFE, VERIFIED],
  grants: [SAFE, VERIFIED],
};

const PLAIN: GuidePath[] = ["/guides/how-to-find-jobs-in-zimbabwe", SAFE, VERIFIED];

/** The guides for a list: its category's, or the general ones for the plain list and unknown categories. */
export function guidesFor(category: string | null | undefined) {
  const paths = (category && CATEGORY_GUIDES[category]) || PLAIN;
  return paths.map((path) => GUIDES.find((g) => g.path === path)!).filter(Boolean);
}
