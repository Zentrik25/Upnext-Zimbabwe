import type { Metadata } from "next";
import { Container } from "@/components/layout";
import { HeroFrame, HeroSearch, TrustSection } from "@/components/home/sections";
import {
  BrowseByCategory,
  BrowseByLocation,
  CareerGuides,
  EmployerCta,
  EntryLevel,
} from "@/components/home/browse";
import { HomeLatest } from "@/components/home/latest";
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
 * The whole page, including the latest listings, the places and the entry-level listings, is in the first HTML
 * response and readable without JavaScript (D-74, owner instruction 2026-11-14). No Suspense boundary: a streamed
 * fallback hid the listing links in a container only a script reveals. The async sections render concurrently.
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
        <HomeSearch />
      </HeroFrame>
      <section aria-labelledby="latest-title" className="py-8 max-sm:py-6">
        <Container>
          <SectionHeading
            id="latest-title"
            title="Latest opportunities"
            href="/opportunities"
            hiddenLabel="opportunities"
          />
          <HomeLatest />
        </Container>
      </section>
      <BrowseByCategory />
      <BrowseByLocation />
      <EntryLevel />
      <CareerGuides />
      <EmployerCta />
      <TrustSection />
    </>
  );
}
