import "server-only";

/** Public origin used in canonical URLs, the sitemap and structured data. The domain is OPEN (OQ-01). */
export const siteUrl = (): string =>
  (process.env.UPNEXT_PUBLIC_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export const absolute = (path: string): string => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

/** Where people can reach the team. Unset until the owner provides it (never invented). */
export const contactEmail = (): string | null => process.env.UPNEXT_CONTACT_EMAIL?.trim() || null;

export const SITE_NAME = "UPNEXT";
export const STATIC_PATHS = ["/", "/opportunities", "/about", "/contact", "/privacy", "/terms"] as const;
