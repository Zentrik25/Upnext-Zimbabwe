/**
 * Which landing pages exist and when they may be indexed (ADR-0027). A landing page is a fixed address for a real
 * place or a real working arrangement, never a combination of filters. It is offered to search engines only while it
 * holds at least `MIN_LANDING_LISTINGS` open listings; below that it is still a valid page for visitors (with an
 * honest empty state) but says `noindex, follow` and is absent from the sitemap. Category lists keep their earlier
 * rule of one listing (D-51). The sitemap and the page apply the same number, so the file never offers a noindex page.
 */
export const MIN_LANDING_LISTINGS = 3;
export const REMOTE_PATH = "/remote-jobs";
export const placePath = (slug: string) => `/locations/${slug}`;
export const isIndexableLanding = (openListings: number) => openListings >= MIN_LANDING_LISTINGS;

const SUMMARY =
  "Every listing names its source and carries a clear verification label. Applications happen on the issuer's own channel.";

export function placeCopy(name: string) {
  return {
    title: `Jobs and Opportunities in ${name}, Zimbabwe`,
    heading: `Jobs and opportunities in ${name}`,
    description: `Open jobs, internships, graduate programmes, scholarships, tenders and grants in ${name}, Zimbabwe. ${SUMMARY}`,
  };
}

export const REMOTE_COPY = {
  title: "Remote Jobs in Zimbabwe",
  heading: "Remote jobs in Zimbabwe",
  description: `Open remote jobs and opportunities that can be done from Zimbabwe. ${SUMMARY}`,
};

/** The landing address a list belongs to when it holds only one location or only the remote work mode. */
export function landingFor(
  used: ReadonlyMap<string, string>,
  places: ReadonlySet<string>,
): string | undefined {
  if (used.size !== 1) return undefined;
  const location = used.get("location");
  if (location !== undefined && places.has(location)) return placePath(location);
  if (used.get("work_mode") === "remote") return REMOTE_PATH;
  return undefined;
}
