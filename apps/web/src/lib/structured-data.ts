import { BRAND } from "./brand";
import type { OpportunityDetail } from "./catalog-types";
import { decodeEntities } from "./safe-html";

/** Plain text of the API's sanitised HTML (tags dropped, entities decoded, whitespace collapsed). */
export function plainText(html: string, max = 5000): string {
  const text = decodeEntities(html.replace(/<\/(p|li|h\d|blockquote)>/gi, " ").replace(/<[^>]*>/g, ""));
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

const JOB_CATEGORIES = new Set(["jobs", "internships", "graduate-programmes"]);
const EMPLOYMENT: Record<string, string> = {
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  part_time: "PART_TIME",
  internship: "INTERN",
};
const PERIOD: Record<string, string> = {
  hour: "HOUR",
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  year: "YEAR",
};

type Json = Record<string, unknown>;

/** True while a listing may be presented as open: published, and its deadline has not passed. The API derives the
 *  deadline state per request, so a listing whose deadline just passed counts as closed even before the scheduled
 *  expiry job has moved it to `expired`. */
export function isOpen(listing: Pick<OpportunityDetail, "status" | "deadline">): boolean {
  return listing.status === "published" && listing.deadline.state !== "expired";
}

/**
 * schema.org JobPosting for the categories it describes (Google's job posting guidelines). Only facts the listing
 * actually states are emitted: an unknown deadline, salary or employment type is simply absent, and "permanent" or
 * "trainee" are not mapped to a schema.org value because they do not say whether the post is full time. No markup at
 * all (rather than invalid markup) is produced when Google's required place information is not stated:
 *  - an on-site listing needs a place: a named town or city, or the country when the listing says Zimbabwe-wide;
 *  - a remote listing needs the countries it may be applied from, taken only from a "Zimbabwe" location.
 * Other categories (scholarships, tenders, grants) have no fitting type and get none. Closed, withdrawn, past-deadline
 * and unknown-status listings get none. `directApply` is false: applications happen on the issuer's own channel.
 */
export function jobPostingFor(listing: OpportunityDetail, pageUrl: string): Json | null {
  if (!isOpen(listing) || !JOB_CATEGORIES.has(listing.category.code)) return null;
  const remote = listing.work_mode === "remote";
  const places = listing.locations.filter((l) => l.slug !== "remote" && l.slug !== "zimbabwe");
  const countrywide = listing.locations.some((l) => l.slug === "zimbabwe");
  if (remote ? !countrywide : places.length === 0 && !countrywide) return null;
  const data: Json = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: listing.title,
    description: plainText(listing.description_html) || listing.summary,
    datePosted: listing.published_at,
    url: pageUrl,
    hiringOrganization: { "@type": "Organization", name: listing.organisation.name },
    directApply: false,
  };
  if (listing.deadline.at) data.validThrough = listing.deadline.at;
  const employment = listing.employment_type ? EMPLOYMENT[listing.employment_type] : undefined;
  if (employment) data.employmentType = employment;
  if (remote) {
    data.jobLocationType = "TELECOMMUTE";
    data.applicantLocationRequirements = { "@type": "Country", name: "Zimbabwe" };
  } else if (places.length > 0) {
    data.jobLocation = places.map((l) => ({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: l.name, addressCountry: "ZW" },
    }));
  } else {
    data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "ZW" } };
  }
  const salary = listing.salary;
  if (salary && (salary.min || salary.max)) {
    const value: Json = { "@type": "QuantitativeValue" };
    if (salary.min && salary.max && salary.min !== salary.max) {
      value.minValue = Number(salary.min);
      value.maxValue = Number(salary.max);
    } else value.value = Number(salary.min ?? salary.max);
    if (salary.period && PERIOD[salary.period]) value.unitText = PERIOD[salary.period];
    data.baseSalary = { "@type": "MonetaryAmount", currency: salary.currency, value };
  }
  if (listing.reference_number) {
    data.identifier = {
      "@type": "PropertyValue",
      name: listing.organisation.name,
      value: listing.reference_number,
    };
  }
  return data;
}

/** schema.org Article for an editorial guide written by UPNEXT itself (never for listings). */
export function articleFor(guide: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.headline,
    description: guide.description,
    url: guide.url,
    mainEntityOfPage: guide.url,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    inLanguage: "en",
    author: { "@type": "Organization", name: BRAND.name },
    publisher: { "@type": "Organization", name: BRAND.name, url: new URL(guide.url).origin },
  };
}

export function breadcrumbFor(items: { name: string; url: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function websiteFor(origin: string): Json[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND.name,
      alternateName: BRAND.short,
      url: origin,
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${origin}/opportunities?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND.name,
      alternateName: BRAND.short,
      url: origin,
      logo: `${origin}${BRAND.assets.icon512}`,
      email: BRAND.email,
    },
  ];
}

/** JSON for a `<script type="application/ld+json">`: `<`, `>`, `&` and line separators cannot end the element. */
export function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
