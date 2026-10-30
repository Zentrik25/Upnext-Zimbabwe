import type { Metadata } from "next";
import { cache, Suspense } from "react";
import Link from "next/link";
import { Container } from "@/components/layout";
import {
  CategoryGrid,
  CategoryGridSkeleton,
  HeroFrame,
  HeroSearch,
  HeroSearchSkeleton,
  TrustSection,
} from "@/components/home/sections";
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

/** One request each for the hero search and the category tiles, which both need the categories. */
const categoriesOnce = cache(listCategories);

async function HomeSearch() {
  const [categories, locations] = await Promise.all([categoriesOnce(), listLocations()]);
  return <HeroSearch categories={categories} locations={locations} />;
}

async function HomeCategories() {
  return <CategoryGrid categories={await categoriesOnce()} />;
}

/**
 * Static content (the headline, the illustration, the section headings, the trust section) is sent at once. The
 * three sections that wait for the API each have their own Suspense boundary, so none of them holds up the others.
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
      <Suspense fallback={<CategoryGridSkeleton />}>
        <HomeCategories />
      </Suspense>
      <section aria-labelledby="latest-title" className="border-b border-line pt-5 pb-6">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="latest-title" className="text-title tracking-title">
              Latest opportunities
            </h2>
            <Link
              href="/opportunities"
              className="inline-flex min-h-[24px] items-center gap-1 text-ctl text-accent underline"
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
