/** Display helpers for the staff console. Dates are shown in Africa/Harare, the product's time zone (CS-09). */

const ZONE = "Africa/Harare";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Not stated";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: ZONE }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ZONE }).format(
    new Date(iso),
  );
}

export function formatClosing(closing: { at: string | null; is_date_only: boolean }): string {
  if (!closing.at) return "Not stated";
  return closing.is_date_only ? formatDate(closing.at) : formatDateTime(closing.at);
}

export function words(value: string | null | undefined): string {
  if (!value) return "-";
  const text = value.replaceAll("_", " ").replaceAll(".", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  expired: "Expired",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

/** Date-only closing (YYYY-MM-DD, Africa/Harare end of day) -> input value, and back. */
export function dateInputValue(iso: string | null, timezone: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? ZONE }).format(date);
  return parts;
}

export function timeInputValue(iso: string | null, timezone: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone ?? ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Harare is UTC+2 all year (no daylight saving), so a local date/time maps to a fixed offset. */
export function harareToIso(date: string, time: string): string {
  return `${date}T${time ? `${time}:00` : "23:59:59"}+02:00`;
}

const HARARE = "Africa/Harare";

/** "1 Nov" for a day bucket, "1 Nov, 14:00" for an hour bucket, "Nov 2026" for a month. Always Harare time. */
export function bucketLabel(iso: string, bucket: "hour" | "day" | "week" | "month"): string {
  const at = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  const zone = iso.length === 10 ? "UTC" : HARARE; // a month bucket is a plain date
  if (bucket === "hour")
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
    }).format(at);
  if (bucket === "month")
    return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: zone }).format(at);
  const text = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: zone }).format(
    at,
  );
  return bucket === "week" ? `Week of ${text}` : text;
}

/** A count with thousands separators ("12 480"); never an invented figure: null shows a dash. */
export const count = (n: number | null | undefined): string =>
  n === null || n === undefined ? "-" : new Intl.NumberFormat("en-GB").format(n);

/** Click-through rate as a percentage; "-" when there were no views to divide by. */
export const percent = (rate: number | null | undefined): string =>
  rate === null || rate === undefined ? "-" : `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
