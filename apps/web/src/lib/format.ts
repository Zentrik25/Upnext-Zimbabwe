import type { Deadline, ListingStatus, Money, OpportunitySummary, VerificationLevel } from "./catalog-types";

const WORD: Record<string, string> = {
  on_site: "On site",
  hybrid: "Hybrid",
  remote: "Remote",
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary",
  part_time: "Part time",
  internship: "Internship",
  trainee: "Trainee",
  none: "No experience needed",
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior level",
  executive: "Executive",
};

export function labelFor(value: string | null): string | null {
  if (value === null) return null;
  return WORD[value] ?? humanise(value);
}

/** `minimum_experience_years` → "Minimum experience years". Keys come from reviewed schemas. */
export function humanise(key: string): string {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PERIOD: Record<string, string> = {
  hour: "per hour",
  day: "per day",
  month: "per month",
  year: "per year",
  once: "one-off",
};

const number = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "USD 700 – 900 per month". Amounts are never converted to another currency. */
export function formatMoney(money: Money | null): string | null {
  if (money === null) return null;
  const { min, max, currency, period } = money;
  const low = min === null ? null : number.format(Number(min));
  const high = max === null ? null : number.format(Number(max));
  let range: string;
  if (low !== null && high !== null) range = low === high ? low : `${low} – ${high}`;
  else if (low !== null) range = `from ${low}`;
  else if (high !== null) range = `up to ${high}`;
  else return null;
  return [currency, range, period ? PERIOD[period] : null].filter(Boolean).join(" ");
}

/** Date in the listing's own time zone; falls back to UTC if the zone name is not recognised. */
export function formatDate(iso: string, timeZone?: string | null, withTime = false): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: timeZone ?? "UTC" }).format(
      new Date(iso),
    );
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(iso));
  }
}

export type DeadlineView = { label: string; tone: "default" | "good" | "urgent" };

/** Deadline wording: an unknown deadline is "Deadline not stated", never invented (R-02). */
export function deadlineView(deadline: Deadline, status: ListingStatus = "published"): DeadlineView {
  if (status === "withdrawn") return { label: "Withdrawn by the issuer", tone: "default" };
  if (deadline.at === null) {
    return { label: status === "expired" ? "Closed" : "Deadline not stated", tone: "default" };
  }
  const when = formatDate(deadline.at, deadline.timezone, !deadline.is_date_only);
  if (deadline.state === "expired" || status === "expired")
    return { label: `Closed ${when}`, tone: "default" };
  if (deadline.state === "closing_soon") return { label: `Closing soon · ${when}`, tone: "urgent" };
  return { label: `Closes ${when}`, tone: "good" };
}

export const VERIFICATION: Record<VerificationLevel, { label: string; explanation: string }> = {
  not_verified: {
    label: "Not verified",
    explanation:
      "UPNEXT has recorded where this information came from but has not checked it against the source or the issuer.",
  },
  source_checked: {
    label: "Source checked",
    explanation:
      "UPNEXT compared this listing with its cited source. This is not confirmation from the issuing organisation.",
  },
  issuer_verified: {
    label: "Verified with the issuer",
    explanation: "UPNEXT confirmed this listing directly with the issuing organisation.",
  },
};

export function locationLabel(row: OpportunitySummary): string | null {
  if (row.locations.length === 0) return null;
  const primary = row.locations.find((l) => l.is_primary) ?? row.locations[0]!;
  return row.locations.length > 1 ? `${primary.name} +${row.locations.length - 1}` : primary.name;
}

export const SOURCE_KIND: Record<string, string> = {
  issuer_website: "Issuer website",
  issuer_notice: "Issuer notice",
  government_gazette: "Government gazette",
  newspaper: "Newspaper",
  email_from_issuer: "E-mail from the issuer",
  social_media: "Social media",
  aggregator: "Aggregator",
  other: "Other",
};

/** Domain shown next to outbound links so people know where they are going. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
