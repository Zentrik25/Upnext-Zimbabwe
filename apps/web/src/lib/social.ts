import type { Metadata } from "next";
import { BRAND } from "./brand";
import type { ListingImage, OpportunityDetail } from "./catalog-types";
import { absolute } from "./site";

/**
 * Link-preview metadata of a listing (D-47), rendered on the server so crawlers that run no JavaScript read it.
 * The image is the one an editor uploaded (the separate social image, else the featured image) with its real
 * dimensions and an absolute URL. Only listings from before images existed fall back to the site card.
 */
export function socialImage(listing: OpportunityDetail): {
  url: string;
  secureUrl?: string;
  width: number;
  height: number;
  alt: string;
  type: string;
} {
  const image: ListingImage | null = listing.social_image ?? listing.featured_image;
  if (image === null) {
    return {
      url: absolute(BRAND.assets.ogImage),
      width: 1200,
      height: 630,
      alt: BRAND.name,
      type: "image/png",
    };
  }
  const url = absolute(image.url);
  return {
    url,
    ...(url.startsWith("https://") ? { secureUrl: url } : {}),
    width: image.width,
    height: image.height,
    alt: image.alt || listing.title,
    type: image.content_type,
  };
}

export function listingMetadata(listing: OpportunityDetail): Metadata {
  const canonical = absolute(listing.canonical_path);
  const image = socialImage(listing);
  return {
    title: listing.seo_title ?? `${listing.title} · ${listing.organisation.name}`,
    description: listing.seo_description ?? listing.summary,
    alternates: { canonical },
    openGraph: {
      siteName: BRAND.name,
      type: "website",
      locale: "en",
      url: canonical,
      title: listing.og_title,
      description: listing.og_description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: listing.og_title,
      description: listing.og_description,
      images: [{ url: image.url, alt: image.alt }],
    },
    // Expired and withdrawn listings stay readable but are not promoted by search engines (OQ-20 default).
    robots: listing.status === "published" ? undefined : { index: false },
  };
}
