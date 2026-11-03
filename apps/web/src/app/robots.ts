import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, TRAINING_CRAWLERS, trainingCrawlersAllowed } from "@/lib/crawler-policy";
import { absolute } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Public pages may be crawled and indexed by every crawler that is not named below. Accounts, the staff workspace,
 * employer tools, the API and one-time-link pages may not (SEO-03). robots.txt only asks crawlers to stay away: those
 * pages are protected by sign-in, and the ones that can be opened also say `noindex` themselves. A page that must
 * stay out of search results but is linked from public pages (report forms, employer registration, searched, sorted
 * and paged lists) is deliberately NOT disallowed: a crawler that may not fetch it never sees its `noindex`, and the
 * bare address could then be shown without a description. Those pages carry `noindex` instead. Nothing the pages need
 * to render (scripts, styles, images, fonts) is blocked.
 *
 * The explicit crawler-access policy lives in `lib/crawler-policy.ts`: search and answer crawlers fall under `*`
 * (allowed); training-only crawlers get a group of their own that disallows everything unless the owner allowed them.
 * A named group replaces the `*` group for that crawler, so it must not be used to relax the private-area rules.
 */
export default function robots(): MetadataRoute.Robots {
  type Rule = Extract<MetadataRoute.Robots["rules"], unknown[]>[number];
  const rules: Rule[] = [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }];
  if (!trainingCrawlersAllowed()) rules.push({ userAgent: [...TRAINING_CRAWLERS], disallow: "/" });
  return { rules, sitemap: absolute("/sitemap.xml") };
}
