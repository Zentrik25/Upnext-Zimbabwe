// Shared-link preview card of a listing: its words, its route and its metadata.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/" }));
const catalog = vi.hoisted(() => ({ getOpportunity: vi.fn() }));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), getSavedIds: vi.fn() }));

import { GET } from "@/app/opportunities/[slug]/og/route";
import { generateMetadata } from "@/app/opportunities/[slug]/page";
import { BRAND, openGraphFor, twitterFor } from "@/lib/brand";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { cardFor, clamp, initialsOf, titleSizeFor } from "@/lib/listing-card";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";

const listing = {
  id: "1",
  slug: "field-officer",
  title: "Field Officer",
  summary: "",
  category: { code: "jobs", name: "Jobs" },
  organisation: { id: "o", name: "Example Trust", profile_slug: null },
  locations: [
    { slug: "harare", name: "Harare", is_primary: true },
    { slug: "mutare", name: "Mutare", is_primary: false },
  ],
  work_mode: null,
  employment_type: "full_time",
  deadline: { at: "2026-12-31", timezone: "Africa/Harare", is_date_only: true, state: "open" },
  salary: null,
  verification: { level: "not_verified", checked_at: null },
  primary_source_name: null,
  status: "published",
  published_at: "2026-10-01T00:00:00Z",
  is_saved: null,
  canonical_path: "/opportunities/field-officer",
} as unknown as OpportunityDetail;

beforeEach(() => vi.clearAllMocks());

describe("the card's words", () => {
  it("come only from the listing: mark, category, title, organisation, where, what kind, deadline", () => {
    expect(cardFor(listing)).toEqual({
      initials: "ET",
      category: "Jobs",
      title: "Field Officer",
      titleSize: 68,
      organisation: "Example Trust",
      facts: ["Harare +1", "Full time", "Closes 31 Dec 2026"],
    });
  });

  it("says plainly when a listing is closed or withdrawn, and leaves out what is not stated", () => {
    const closed = cardFor({ ...listing, status: "expired", employment_type: null, locations: [] });
    expect(closed.facts).toEqual(["Closed 31 Dec 2026"]);
    expect(cardFor({ ...listing, status: "withdrawn" }).facts.at(-1)).toBe("Withdrawn by the issuer");
  });

  it("clamps long text at a word and shrinks the type so three lines fit", () => {
    const long = "Senior Monitoring Evaluation and Learning Officer ".repeat(5);
    const text = clamp(long, 110);
    expect(text.length).toBeLessThanOrEqual(110);
    expect(text.endsWith("…")).toBe(true);
    expect(clamp("short", 110)).toBe("short");
    expect(titleSizeFor("x".repeat(30))).toBe(68);
    expect(titleSizeFor("x".repeat(60))).toBe(56);
    expect(titleSizeFor("x".repeat(100))).toBe(46);
  });

  it("takes two initials, and a neutral one when there is no name", () => {
    expect(initialsOf("ministry of health and child care")).toBe("MO");
    expect(initialsOf("Zimbabwe")).toBe("Z");
    expect(initialsOf("  ")).toBe("U");
  });
});

describe("the card route", () => {
  const call = (slug: string) =>
    GET(new Request(`https://upnext.co.zw/opportunities/${slug}/og`) as never, {
      params: Promise.resolve({ slug }),
    });

  it("has no card for a listing that is not public", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: null });
    expect((await call("nope")).status).toBe(404);
  });

  it("falls back to the shared site image when the service cannot be reached", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: false, reason: "unreachable" });
    const response = await call("field-officer");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://upnext.co.zw/brand/og-image.png");
  });
});

describe("metadata", () => {
  it("a listing's Open Graph and Twitter image is its own card, 1200x630, with a descriptive alt", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing });
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "field-officer" }) });
    expect(meta.openGraph?.images).toEqual([
      {
        url: "/opportunities/field-officer/og",
        width: 1200,
        height: 630,
        alt: "Field Officer, Example Trust",
      },
    ]);
    expect(meta.twitter?.images).toEqual(["/opportunities/field-officer/og"]);
    expect(meta.alternates?.canonical).toBe("/opportunities/field-officer");
  });

  it("every other page keeps the shared site image", () => {
    expect(openGraphFor("/").images[0]).toMatchObject({
      url: BRAND.assets.ogImage,
      width: 1200,
      height: 630,
    });
    expect(twitterFor().images).toEqual([BRAND.assets.ogImage]);
  });

  it("an unknown listing gets no card of its own", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: null });
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "nope" }) });
    expect(meta.openGraph).toBeUndefined();
  });
});
