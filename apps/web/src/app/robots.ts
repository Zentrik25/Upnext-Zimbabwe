import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Public pages may be indexed; accounts, staff, the API and one-time-link pages may not (SEO-03). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/staff/",
          "/api/",
          "/health/",
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
        ],
      },
    ],
    sitemap: absolute("/sitemap.xml"),
  };
}
