import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { CategoryGrid, EmployerSection, Hero, TrustSection } from "@/components/home/sections";
import { OpportunityRow } from "@/components/opportunities/parts";
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
      <section aria-labelledby="latest-title" className="border-b border-line py-14">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="latest-title" className="text-display font-strong tracking-display">
              Latest opportunities
            </h2>
            <Link
              href="/opportunities"
              className="inline-flex min-h-[24px] items-center text-ctl text-accent underline"
            >
              See all opportunities
            </Link>
          </div>
          {rows.length > 0 ? (
            <div
              className="mt-6 rounded-feature border border-border-panel bg-surface px-5 max-sm:px-3"
              data-testid="latest"
            >
              {rows.map((row) => (
                <OpportunityRow
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
      <CategoryGrid categories={categories} />
      <TrustSection />
      <EmployerSection />
    </>
  );
}
