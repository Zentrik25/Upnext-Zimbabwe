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

/**
 * schema.org JobPosting for the categories it describes. Only facts the listing actually states are emitted:
 * an unknown deadline, salary or location is simply absent, and "permanent" or "trainee" are not mapped to a
 * schema.org value because they do not say whether the post is full time. Other categories (scholarships,
 * tenders, grants) have no fitting type and get none. Closed, withdrawn or unknown-status listings get none.
 */
export function jobPostingFor(listing: OpportunityDetail, pageUrl: string): Json | null {
  if (listing.status !== "published" || !JOB_CATEGORIES.has(listing.category.code)) return null;
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
  const places = listing.locations.filter((l) => l.slug !== "remote" && l.slug !== "zimbabwe");
  if (places.length > 0) {
    data.jobLocation = places.map((l) => ({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: l.name, addressCountry: "ZW" },
    }));
  }
  if (listing.work_mode === "remote") data.jobLocationType = "TELECOMMUTE";
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
  if (listing.reference_number) data.identifier = listing.reference_number;
  return data;
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
