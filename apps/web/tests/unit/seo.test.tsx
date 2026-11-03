import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { JsonLd } from "@/components/seo/json-ld";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { absolute, contactEmail, siteUrl } from "@/lib/site";
import {
  articleFor,
  breadcrumbFor,
  isOpen,
  jobPostingFor,
  plainText,
  safeJson,
  websiteFor,
} from "@/lib/structured-data";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "graduate-engineer-abc123",
  title: "Graduate Engineer",
  summary: "Support projects.",
  category: { code: "jobs", name: "Jobs" },
  organisation: { id: "o1", name: "Example Power Services" },
  locations: [{ slug: "harare", name: "Harare", is_primary: true }],
  work_mode: "on_site",
  employment_type: "contract",
  deadline: { at: "2026-12-02T14:30:00Z", timezone: "Africa/Harare", is_date_only: false, state: "open" },
  salary: { min: "700.00", max: "900.00", currency: "USD", period: "month" },
  verification: { level: "source_checked", checked_at: null },
  primary_source_name: "Careers page",
  status: "published",
  published_at: "2026-10-17T10:00:00Z",
  is_saved: null,
  description_html: "<p>Assist engineers &amp; write reports.</p><ul><li>Site visits</li></ul>",
  reference_number: "GEE-2026-07",
} as unknown as OpportunityDetail;

describe("structured data", () => {
  it("describes a job with only the facts the listing states", () => {
    const data = jobPostingFor(base, "https://example.test/opportunities/graduate-engineer-abc123")!;
    expect(data["@type"]).toBe("JobPosting");
    expect(data.title).toBe("Graduate Engineer");
    expect(data.description).toBe("Assist engineers & write reports. Site visits");
    expect(data.validThrough).toBe("2026-12-02T14:30:00Z");
    expect(data.employmentType).toBe("CONTRACTOR");
    expect(data.directApply).toBe(false);
    expect(data.identifier).toEqual({
      "@type": "PropertyValue",
      name: "Example Power Services",
      value: "GEE-2026-07",
    });
    expect(data.baseSalary).toEqual({
      "@type": "MonetaryAmount",
      currency: "USD",
      value: { "@type": "QuantitativeValue", minValue: 700, maxValue: 900, unitText: "MONTH" },
    });
    expect(JSON.stringify(data.jobLocation)).toContain("Harare");
  });
  it("leaves out what is unknown or ambiguous instead of inventing it", () => {
    const sparse = {
      ...base,
      deadline: { at: null, timezone: null, is_date_only: false, state: "unknown" },
      salary: null,
      employment_type: "permanent",
      reference_number: null,
    } as unknown as OpportunityDetail;
    const data = jobPostingFor(sparse, "https://example.test/x")!;
    for (const key of ["validThrough", "baseSalary", "employmentType", "identifier"])
      expect(data).not.toHaveProperty(key);
  });
  it("marks up pay only with figures, an ISO currency and a period, never a guessed unit", () => {
    const pay = (salary: unknown) =>
      jobPostingFor({ ...base, salary } as unknown as OpportunityDetail, "u")!.baseSalary;
    expect(pay({ min: "700.00", max: "700.00", currency: "USD", period: "month" })).toEqual({
      "@type": "MonetaryAmount",
      currency: "USD",
      value: { "@type": "QuantitativeValue", unitText: "MONTH", value: 700 },
    });
    expect(pay({ min: "700.00", max: "900.00", currency: "USD", period: null })).toBeUndefined();
    expect(pay({ min: "700.00", max: "900.00", currency: "usd", period: "month" })).toBeUndefined();
    expect(pay({ min: "abc", max: null, currency: "USD", period: "month" })).toBeUndefined();
    expect(pay({ min: null, max: null, currency: "USD", period: "month" })).toBeUndefined();
  });
  it("describes where the job is only from stated places, and emits nothing when none is stated", () => {
    const at = (over: Record<string, unknown>) =>
      jobPostingFor({ ...base, ...over } as unknown as OpportunityDetail, "u");
    // no place at all: Google requires one, so there is no markup rather than invalid markup
    expect(at({ locations: [] })).toBeNull();
    // country-wide on site: the country only, no invented town
    const wide = at({ locations: [{ slug: "zimbabwe", name: "Zimbabwe", is_primary: true }] })!;
    expect(wide.jobLocation).toEqual({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressCountry: "ZW" },
    });
    // remote: needs the country applicants may be in, taken only from a "Zimbabwe" location
    expect(at({ work_mode: "remote" })).toBeNull();
    const remote = at({
      work_mode: "remote",
      locations: [{ slug: "zimbabwe", name: "Zimbabwe", is_primary: true }],
    })!;
    expect(remote.jobLocationType).toBe("TELECOMMUTE");
    expect(remote.applicantLocationRequirements).toEqual({ "@type": "Country", name: "Zimbabwe" });
    expect(remote).not.toHaveProperty("jobLocation");
  });
  it("is not emitted for other categories or for closed listings", () => {
    expect(
      jobPostingFor({ ...base, category: { code: "tenders", name: "Tenders" } } as OpportunityDetail, "u"),
    ).toBeNull();
    for (const status of ["expired", "withdrawn"])
      expect(jobPostingFor({ ...base, status } as OpportunityDetail, "u")).toBeNull();
  });
  it("is not emitted once the deadline has passed, even before the expiry job has run", () => {
    const late = { ...base, deadline: { ...base.deadline, state: "expired" } } as OpportunityDetail;
    expect(late.status).toBe("published");
    expect(jobPostingFor(late, "u")).toBeNull();
    expect(isOpen(late)).toBe(false);
    expect(isOpen(base)).toBe(true);
  });
  it("builds a breadcrumb and the site description", () => {
    const crumbs = breadcrumbFor([
      { name: "A", url: "https://x/a" },
      { name: "B", url: "https://x/b" },
    ]);
    expect(JSON.stringify(crumbs)).toContain('"position":2');
    const [site, org] = websiteFor("https://x");
    expect(site!["@type"]).toBe("WebSite");
    expect(JSON.stringify(site)).toContain("https://x/opportunities?q={search_term_string}");
    expect(org!["@type"]).toBe("Organization");
  });
  it("describes an editorial guide as an Article by the organisation, never as a job", () => {
    const article = articleFor({
      headline: "H",
      description: "D",
      url: "https://x.test/guides/g",
      datePublished: "2026-10-30",
      dateModified: "2026-10-30",
    });
    expect(article).toMatchObject({
      "@type": "Article",
      mainEntityOfPage: "https://x.test/guides/g",
      author: { "@type": "Organization", name: "UPNEXT Careers" },
      publisher: { "@type": "Organization", url: "https://x.test" },
    });
  });
  it("turns sanitised HTML into plain text", () => {
    expect(plainText("<p>One</p><p>Two &lt;b&gt;</p>")).toBe("One Two <b>");
    expect(plainText("x".repeat(9000)).length).toBe(5000);
  });
});

describe("JSON-LD output cannot break out of its element", () => {
  const hostile = { title: '</script><script>alert(1)</script> & "quoted" \u2028 end' };
  it("escapes angle brackets, ampersands and line separators", () => {
    const text = safeJson(hostile);
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual(hostile); // still the same data
  });
  it("renders one non-executable script block and no markup from the data", () => {
    const { container } = render(<JsonLd data={hostile} />);
    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.type).toBe("application/ld+json");
    expect(container.querySelectorAll("script[type='application/ld+json'] *")).toHaveLength(0);
    expect(JSON.parse(scripts[0]!.textContent ?? "")).toEqual(hostile);
  });
});

describe("site settings", () => {
  it("builds absolute addresses from the configured origin and always shows the one official address", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://example.test/");
    expect(siteUrl()).toBe("https://example.test");
    expect(absolute("/opportunities")).toBe("https://example.test/opportunities");
    expect(contactEmail()).toBe("info@upnext.co.zw");
    vi.unstubAllEnvs();
  });
});
