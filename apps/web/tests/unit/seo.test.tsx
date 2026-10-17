import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { JsonLd } from "@/components/seo/json-ld";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { absolute, contactEmail, siteUrl } from "@/lib/site";
import { breadcrumbFor, jobPostingFor, plainText, safeJson, websiteFor } from "@/lib/structured-data";

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
    expect(data.identifier).toBe("GEE-2026-07");
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
      locations: [],
      reference_number: null,
    } as unknown as OpportunityDetail;
    const data = jobPostingFor(sparse, "https://example.test/x")!;
    for (const key of ["validThrough", "baseSalary", "employmentType", "jobLocation", "identifier"])
      expect(data).not.toHaveProperty(key);
    const remote = jobPostingFor({ ...base, work_mode: "remote" } as OpportunityDetail, "u")!;
    expect(remote.jobLocationType).toBe("TELECOMMUTE");
  });
  it("is not emitted for other categories or for closed listings", () => {
    expect(
      jobPostingFor({ ...base, category: { code: "tenders", name: "Tenders" } } as OpportunityDetail, "u"),
    ).toBeNull();
    for (const status of ["expired", "withdrawn"])
      expect(jobPostingFor({ ...base, status } as OpportunityDetail, "u")).toBeNull();
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
  it("builds absolute addresses from the configured origin and never invents a contact", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://example.test/");
    expect(siteUrl()).toBe("https://example.test");
    expect(absolute("/opportunities")).toBe("https://example.test/opportunities");
    vi.stubEnv("UPNEXT_CONTACT_EMAIL", "");
    expect(contactEmail()).toBeNull();
    vi.stubEnv("UPNEXT_CONTACT_EMAIL", " hello@example.test ");
    expect(contactEmail()).toBe("hello@example.test");
    vi.unstubAllEnvs();
  });
});
