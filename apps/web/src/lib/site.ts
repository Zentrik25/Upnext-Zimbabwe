import "server-only";
import { BRAND } from "./brand";
import { GUIDE_PATHS } from "./guides";

/**
 * Public origin used in canonical URLs, the sitemap and structured data. Production sets
 * `UPNEXT_PUBLIC_BASE_URL=https://upnext.co.zw` (BRAND.canonicalOrigin, the apex domain); development and CI
 * default to localhost so a preview never claims the production domain.
 */
export const siteUrl = (): string =>
  (process.env.UPNEXT_PUBLIC_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export const absolute = (path: string): string => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

/** The one official mailbox (owner decision D-42): contact, privacy enquiries and every system e-mail. */
export const contactEmail = (): string => BRAND.email;

export const SITE_NAME = BRAND.name;
export const STATIC_PATHS = [
  "/",
  "/opportunities",
  "/about",
  "/employers",
  "/contact",
  "/privacy",
  "/terms",
  ...GUIDE_PATHS,
] as const;
