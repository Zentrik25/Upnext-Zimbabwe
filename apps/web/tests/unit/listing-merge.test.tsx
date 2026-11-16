/**
 * Merged duplicate listings and ad placement on the listing page (AdSense audit 2026-11-16, D-79).
 *
 * The API answers a retired duplicate's address with the listing that replaced it; the page then moves the visitor
 * permanently, in one step, to the canonical address (Next.js answers `permanentRedirect` with 308 before any HTML),
 * and never renders the duplicate's address with JobPosting markup. The ad slot appears only on an open listing, after
 * real description text, so it never sits straight under the Apply, Save and Share row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  usePathname: () => "/opportunities/supply-assistant-abc123",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/navigation", () => nav);
vi.mock("@/components/ads/ad-slot", () => ({ AdSlot: () => <div data-testid="ad-slot" /> }));
vi.mock("@/components/insights/related-insights", () => ({ RelatedInsights: () => null }));
const catalog = vi.hoisted(() => ({
  getOpportunity: vi.fn(),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(async () => null),
  getSavedIds: vi.fn(async () => new Set()),
}));

import OpportunityPage, { generateMetadata } from "@/app/opportunities/[slug]/page";
import ReportPage from "@/app/opportunities/[slug]/report/page";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { serverHtml } from "./helpers";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";

const CANONICAL = "totalenergies-supply-assistant-harare";
const DUPLICATE = "supply-assistant-nmk7k5";

const listing = (over: Partial<OpportunityDetail> = {}) =>
  ({
    id: "1",
    slug: CANONICAL,
    title: "Supply Assistant",
    summary: "Support the supply team.",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o", name: "TotalEnergies Marketing Zimbabwe" },
    locations: [{ slug: "harare", name: "Harare", is_primary: true }],
    location_text: "Harare",
    work_mode: "on_site",
    employment_type: "full_time",
    deadline: { at: "2099-01-01T21:59:59Z", timezone: "Africa/Harare", is_date_only: true, state: "open" },
    salary: null,
    salary_text: null,
    funding: null,
    geographic_eligibility: null,
    experience_level: null,
    contact_details: null,
    is_saved: null,
    primary_source_name: null,
    detail_schema_version: 1,
    status: "published",
    published_at: "2026-11-15T10:00:00Z",
    updated_at: "2026-11-15T10:00:00Z",
    description_html: "<p>Plan and track stock.</p>",
    requirements_html: null,
    canonical_path: `/opportunities/${CANONICAL}`,
    seo: { title: null, description: null, og_title: null, og_description: null },
    reference_number: "82490",
    application: {
      method: "external_url",
      url: "https://jobs.example.org/82490",
      email: null,
      email_subject: null,
      instructions: null,
      instructions_html: null,
    },
    verification: { level: "issuer_verified", checked_at: null, method: null },
    sources: [],
    skills: [],
    sectors: [],
    detail: {},
    image: null,
    ...over,
  }) as unknown as OpportunityDetail;

beforeEach(() => {
  catalog.getOpportunity.mockReset();
  catalog.listOpportunities.mockResolvedValue({
    ok: true,
    data: { data: [], page: { limit: 8, has_more: false, next_cursor: null, total: 0 } },
  });
});

describe("a merged duplicate's address moves permanently to the canonical listing", () => {
  it("redirects in one step, from the exact address and from any other spelling of it", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing() });
    for (const slug of [DUPLICATE, DUPLICATE.toUpperCase()]) {
      await expect(OpportunityPage({ params: Promise.resolve({ slug }) })).rejects.toThrow(
        `NEXT_REDIRECT /opportunities/${CANONICAL}`,
      );
    }
    expect(nav.permanentRedirect).toHaveBeenLastCalledWith(`/opportunities/${CANONICAL}`);
  });

  it("names only the canonical address in its metadata", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing() });
    const meta = await generateMetadata({ params: Promise.resolve({ slug: DUPLICATE }) });
    expect(meta.alternates?.canonical).toBe(`/opportunities/${CANONICAL}`);
  });

  it("the report form of the old address moves to the canonical listing's report form", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing() });
    await expect(ReportPage({ params: Promise.resolve({ slug: DUPLICATE }) })).rejects.toThrow(
      `NEXT_REDIRECT /opportunities/${CANONICAL}/report`,
    );
  });

  it("the canonical page itself renders, with JobPosting markup, and does not redirect", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing() });
    nav.permanentRedirect.mockClear();
    const root = await serverHtml(await OpportunityPage({ params: Promise.resolve({ slug: CANONICAL }) }));
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
    const postings = [...root.querySelectorAll('script[type="application/ld+json"]')].filter((s) =>
      s.textContent?.includes('"JobPosting"'),
    );
    expect(postings).toHaveLength(1);
    expect(postings[0]!.textContent).toContain(`/opportunities/${CANONICAL}`);
    expect(postings[0]!.textContent).not.toContain(DUPLICATE);
  });

  it("an address the API does not know stays a 404", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: null });
    await expect(OpportunityPage({ params: Promise.resolve({ slug: "gone-abc123" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("the listing page shows an ad slot only where it is eligible", () => {
  const render = async (over: Partial<OpportunityDetail>) => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing(over) });
    return serverHtml(await OpportunityPage({ params: Promise.resolve({ slug: CANONICAL }) }));
  };

  it("an open listing with a description: one slot, after the description and apart from the action row", async () => {
    const root = await render({});
    const slots = root.querySelectorAll('[data-testid="ad-slot"]');
    expect(slots).toHaveLength(1);
    const actions = root.querySelector('[data-testid="action-row"]')!;
    expect(actions.contains(slots[0]!)).toBe(false);
    // Document order: the action row, then the description text, then the ad.
    const description = [...root.querySelectorAll("p")].find(
      (p) => p.textContent === "Plan and track stock.",
    )!;
    expect(actions.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(description.compareDocumentPosition(slots[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no slot without a description (it would sit straight under Apply, Save and Share)", async () => {
    expect((await render({ description_html: "" })).querySelector('[data-testid="ad-slot"]')).toBeNull();
  });

  it("no slot on a closed, withdrawn or past-deadline listing", async () => {
    for (const over of [
      { status: "expired" },
      { status: "withdrawn" },
      {
        deadline: {
          at: "2020-01-01T21:59:59Z",
          timezone: "Africa/Harare",
          is_date_only: true,
          state: "expired",
        },
      },
    ] as Partial<OpportunityDetail>[]) {
      expect((await render(over)).querySelector('[data-testid="ad-slot"]'), JSON.stringify(over)).toBeNull();
    }
  });
});
