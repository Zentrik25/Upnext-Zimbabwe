import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/layout";
import { HeroFrame, HeroSearch, HeroSearchSkeleton, TrustSection } from "@/components/home/sections";
import {
  BrowseByCategory,
  BrowseByLocation,
  BrowseLocationSkeleton,
  CareerGuides,
  EmployerCta,
  EntryLevel,
  EntryLevelSkeleton,
} from "@/components/home/browse";
import { HomeLatest, HomeLatestSkeleton } from "@/components/home/latest";
import { SectionHeading } from "@/components/public/cards";
import { JsonLd } from "@/components/seo/json-ld";
import { listCategories, listLocations } from "@/lib/catalog";
import { BRAND, socialFor } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import { websiteFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: BRAND.homeTitle },
  description: BRAND.homeDescription,
  ...socialFor("/", { title: BRAND.homeTitle, description: BRAND.homeDescription }),
};

async function HomeSearch() {
  const [categories, locations] = await Promise.all([listCategories(), listLocations()]);
  return <HeroSearch categories={categories} locations={locations} />;
}

/**
 * Static content (the headline, the illustration, the section headings, the trust section) is sent at once. The
 * two sections that wait for the API each have their own Suspense boundary, so none of them holds up the others.
 */
export default function HomePage() {
  return (
    <>
      {/* The owner specified the canonical as the origin with its trailing slash (D-69). Next.js metadata always
          writes a root canonical as the bare origin (the same URL by RFC 3986), so this one tag is written here;
          React places it in <head>. No other canonical is set for the home page. */}
      <link rel="canonical" href={`${siteUrl()}/`} />
      {websiteFor(siteUrl()).map((block, index) => (
        <JsonLd key={index} data={block} />
      ))}
      <HeroFrame>
        <Suspense fallback={<HeroSearchSkeleton />}>
          <HomeSearch />
        </Suspense>
      </HeroFrame>
      <section aria-labelledby="latest-title" className="py-8 max-sm:py-6">
        <Container>
          <SectionHeading
            id="latest-title"
            title="Latest opportunities"
            href="/opportunities"
            hiddenLabel="opportunities"
          />
          <Suspense fallback={<HomeLatestSkeleton />}>
            <HomeLatest />
          </Suspense>
        </Container>
      </section>
      <BrowseByCategory />
      <Suspense fallback={<BrowseLocationSkeleton />}>
        <BrowseByLocation />
      </Suspense>
      <Suspense fallback={<EntryLevelSkeleton />}>
        <EntryLevel />
      </Suspense>
      <CareerGuides />
      <EmployerCta />
      <TrustSection />
    </>
  );
}
