import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Public pages may be crawled and indexed. Accounts, the staff workspace, employer tools, the API and one-time-link
 * pages may not (SEO-03). robots.txt only asks crawlers to stay away: those pages are protected by sign-in, and the
 * ones that can be opened also say `noindex` themselves. A page that must stay out of search results but is linked
 * from public pages (report forms, employer registration, searched, sorted and paged lists) is deliberately NOT
 * disallowed: a crawler that may not fetch it never sees its `noindex`, and the bare address could then be shown
 * without a description. Those pages carry `noindex` instead. Nothing the pages need to render (scripts, styles,
 * images, fonts) is blocked.
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
        ],
      },
    ],
    sitemap: absolute("/sitemap.xml"),
  };
}
