import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { OpportunityDetail } from "@/lib/catalog-types";
import { listingMetadata, socialImage } from "@/lib/social";

const image = (url: string, width: number, height: number, alt: string) => ({
  url,
  width,
  height,
  content_type: "image/jpeg",
  alt,
});

const listing = {
  slug: "graduate-electrical-engineer-abc-engineering",
  title: "Graduate Electrical Engineer",
  summary: "Support projects.",
  organisation: { id: "o1", name: "ABC Engineering" },
  status: "published",
  canonical_path: "/opportunities/graduate-electrical-engineer-abc-engineering",
  seo_title: null,
  seo_description: null,
  og_title: "Graduate Electrical Engineer at ABC Engineering | UPNEXT Careers",
  og_description: "ABC Engineering is recruiting a Graduate Electrical Engineer in Harare, Zimbabwe.",
  featured_image: image("/api/v1/media/" + "a".repeat(64) + ".jpg", 1600, 900, "The site office"),
  social_image: null,
} as unknown as OpportunityDetail;

afterEach(() => vi.unstubAllEnvs());

describe("listing link-preview metadata (D-47)", () => {
  it("uses the editor's text, the canonical URL and a large-image card", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://upnext.co.zw");
    const meta = listingMetadata(listing);
    expect(meta.alternates?.canonical).toBe(
      "https://upnext.co.zw/opportunities/graduate-electrical-engineer-abc-engineering",
    );
    expect(meta.openGraph).toMatchObject({
      type: "website",
      url: "https://upnext.co.zw/opportunities/graduate-electrical-engineer-abc-engineering",
      title: listing.og_title,
      description: listing.og_description,
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: listing.og_title,
      description: listing.og_description,
    });
  });

  it("falls back to the featured image, with its real size and an absolute https address", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://upnext.co.zw");
    const shown = socialImage(listing);
    expect(shown.url).toBe(`https://upnext.co.zw/api/v1/media/${"a".repeat(64)}.jpg`);
    expect(shown.secureUrl).toBe(shown.url);
    expect([shown.width, shown.height]).toEqual([1600, 900]);
    expect(shown.alt).toBe("The site office");
    expect(shown.type).toBe("image/jpeg");
  });

  it("prefers the separately uploaded social image and uses its own dimensions", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://upnext.co.zw");
    const custom = {
      ...listing,
      social_image: image("/api/v1/media/" + "b".repeat(64) + ".jpg", 1200, 630, "Card"),
    };
    const shown = socialImage(custom as OpportunityDetail);
    expect(shown.url).toContain("b".repeat(64));
    expect([shown.width, shown.height]).toEqual([1200, 630]);
    expect(shown.alt).toBe("Card");
  });

  it("claims no secure URL on a plain-http development origin", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "http://localhost:8080");
    expect(socialImage(listing).secureUrl).toBeUndefined();
  });

  it("keeps the site card for a listing from before images existed, and does not index closed ones", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://upnext.co.zw");
    const old = { ...listing, featured_image: null, social_image: null, status: "expired" };
    const meta = listingMetadata(old as unknown as OpportunityDetail);
    expect(socialImage(old as unknown as OpportunityDetail).url).toBe(
      "https://upnext.co.zw/brand/og-image.png",
    );
    expect(meta.robots).toEqual({ index: false });
  });
});
