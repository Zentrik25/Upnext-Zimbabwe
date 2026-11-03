import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Container } from "@/components/layout";
import { HeroFrame, HeroSearch, HeroSearchSkeleton, TrustSection } from "@/components/home/sections";
import { HomeLatest, HomeLatestSkeleton } from "@/components/home/latest";
import { Icon } from "@/components/ui/icons";
import { JsonLd } from "@/components/seo/json-ld";
import { listCategories, listLocations } from "@/lib/catalog";
import { BRAND, socialFor } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import { websiteFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: "/" },
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
      {websiteFor(siteUrl()).map((block, index) => (
        <JsonLd key={index} data={block} />
      ))}
      <HeroFrame>
        <Suspense fallback={<HeroSearchSkeleton />}>
          <HomeSearch />
        </Suspense>
      </HeroFrame>
      <section aria-labelledby="latest-title" className="pt-5 pb-6">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="latest-title" className="font-headline text-title tracking-title">
              Latest opportunities
            </h2>
            <Link
              href="/opportunities"
              className="font-headline inline-flex min-h-[24px] items-center gap-1 text-ctl text-accent"
            >
              View all
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
          <Suspense fallback={<HomeLatestSkeleton />}>
            <HomeLatest />
          </Suspense>
        </Container>
      </section>
      <TrustSection />
    </>
  );
}
