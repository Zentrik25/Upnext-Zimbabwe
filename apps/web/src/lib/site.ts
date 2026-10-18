import "server-only";
import { BRAND } from "./brand";

/** Public origin used in canonical URLs, the sitemap and structured data. The domain is OPEN (OQ-01). */
export const siteUrl = (): string =>
  (process.env.UPNEXT_PUBLIC_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export const absolute = (path: string): string => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

/** Where people can reach the team. Unset until the owner provides it (never invented). */
export const contactEmail = (): string | null => process.env.UPNEXT_CONTACT_EMAIL?.trim() || null;

/**
 * The approved mailboxes (owner decision D-33). Each appears only when its address is configured, so an
 * address whose mailbox has not been created and verified is never shown to the public.
 */
export function mailboxes(): { purpose: string; email: string }[] {
  const rows: [string, string | undefined][] = [
    ["General enquiries", process.env.UPNEXT_CONTACT_EMAIL],
    ["Support and account help", process.env.UPNEXT_SUPPORT_EMAIL],
    ["Listings and editorial enquiries", process.env.UPNEXT_JOBS_EMAIL],
    ["Business partnerships", process.env.UPNEXT_PARTNERSHIPS_EMAIL],
  ];
  return rows.flatMap(([purpose, value]) => (value?.trim() ? [{ purpose, email: value.trim() }] : []));
}

export const SITE_NAME = BRAND.name;
export const STATIC_PATHS = [
  "/",
  "/opportunities",
  "/about",
  "/employers",
  "/contact",
  "/privacy",
  "/terms",
] as const;
