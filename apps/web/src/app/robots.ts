import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Public pages may be crawled and indexed. Accounts, the staff workspace, employer tools, the API, one-time-link
 * pages and report forms may not (SEO-03). robots.txt only asks crawlers to stay away: those pages are protected by
 * sign-in, and the ones that can be opened also say `noindex` themselves. Address patterns that only re-sort,
 * re-size or page the same listings are kept out of the crawl; the listings themselves are reached through the
 * sitemap and the category lists. Nothing the pages need to render (scripts, styles, images, fonts) is blocked.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/workspace",
          "/api/",
          "/health/",
          "/django-admin/",
          "/account",
          "/saved",
          "/dashboard",
          "/for-you",
          "/profile",
          "/alerts",
          "/sign-in",
          "/register",
          "/verify-email",
          "/forgot-password",
          "/reset-password",
          "/employer/", // employer tools; the public /employers pages stay open
          "/employers/register",
          "/opportunities/*/report",
          "/*?*sort=",
          "/*?*cursor=",
          "/*?*limit=",
        ],
      },
    ],
    sitemap: absolute("/sitemap.xml"),
  };
}
