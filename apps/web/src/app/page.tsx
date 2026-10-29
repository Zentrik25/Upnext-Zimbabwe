import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { CategoryGrid, Hero, TrustSection } from "@/components/home/sections";
import { Icon } from "@/components/ui/icons";
import { HomeListingRow } from "@/components/home/home-row";
import { JsonLd } from "@/components/seo/json-ld";
import { listCategories, listLocations, listOpportunities } from "@/lib/catalog";
import { getCurrentUser, getSavedIds } from "@/lib/session";
import { BRAND, openGraphFor } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import { websiteFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: { absolute: BRAND.homeTitle },
  description: BRAND.homeDescription,
  openGraph: openGraphFor("/", { title: BRAND.homeTitle, description: BRAND.homeDescription }),
};

export default async function HomePage() {
  const [latest, categories, locations, user] = await Promise.all([
    listOpportunities(new URLSearchParams({ limit: "6" })),
    listCategories(),
    listLocations(),
    getCurrentUser(),
  ]);
  const rows = latest.ok ? latest.data.data : [];
  const savedIds = user ? await getSavedIds(rows.map((row) => row.id)) : new Set<string>();
  return (
    <>
      {websiteFor(siteUrl()).map((block, index) => (
        <JsonLd key={index} data={block} />
      ))}
      <Hero categories={categories} locations={locations} />
      <CategoryGrid categories={categories} />
      <section aria-labelledby="latest-title" className="border-b border-line pt-5 pb-6">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="latest-title" className="font-headline text-[20px] tracking-title">
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
          {rows.length > 0 ? (
            <div
              className="mt-3 overflow-hidden rounded-feature border border-border-panel bg-surface"
              data-testid="latest"
            >
              {rows.map((row) => (
                <HomeListingRow
                  key={row.id}
                  row={row}
                  save={{ signedIn: Boolean(user), saved: savedIds.has(row.id), returnTo: "/" }}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-base text-muted" data-testid="latest-empty">
              {latest.ok
                ? "New opportunities are added as they are checked."
                : "Opportunities are unavailable right now. Try again shortly."}
            </p>
          )}
        </Container>
      </section>
      <TrustSection />
    </>
  );
}
