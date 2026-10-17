import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { OpportunityRow } from "@/components/opportunities/parts";
import { JsonLd } from "@/components/seo/json-ld";
import { Button, Notice, SearchGroup } from "@/components/ui";
import { listCategories, listOpportunities } from "@/lib/catalog";
import { getCurrentUser, getSavedIds } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { websiteFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: { absolute: "UPNEXT · Opportunity discovery for Zimbabwe" },
};

export default async function HomePage() {
  const [latest, categories, user] = await Promise.all([
    listOpportunities(new URLSearchParams({ limit: "6" })),
    listCategories(),
    getCurrentUser(),
  ]);
  const rows = latest.ok ? latest.data.data : [];
  const savedIds = user ? await getSavedIds(rows.map((row) => row.id)) : new Set<string>();
  return (
    <>
      {websiteFor(siteUrl()).map((block, index) => (
        <JsonLd key={index} data={block} />
      ))}
      <Notice>Every listing names its source. Applications happen on the issuer&apos;s own channel.</Notice>
      <section aria-labelledby="home-title" className="border-b border-line py-[30px] max-sm:py-6">
        <Container>
          <p className="text-micro font-semi uppercase tracking-eyebrow text-eyebrow">
            Opportunity discovery for Zimbabwe
          </p>
          <h1 id="home-title" className="mt-2 mb-[6px] text-hero font-strong leading-hero tracking-hero">
            Discover what&apos;s next.
          </h1>
          <p className="text-base text-muted">
            Jobs, internships, graduate programmes, scholarships, tenders and grants in one place.
          </p>
          <SearchGroup
            action="/opportunities"
            method="get"
            aria-label="Search opportunities"
            className="mt-4"
          >
            <label htmlFor="home-q" className="sr-only">
              Search by title, organisation or keyword
            </label>
            <SearchGroup.Input
              id="home-q"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Title, organisation or keyword"
            />
            <Button type="submit" size="search">
              Search
            </Button>
          </SearchGroup>
          {categories.length > 0 ? (
            <nav aria-label="Browse by category" className="mt-4">
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {categories.map((category) => (
                  <li key={category.code}>
                    <Link
                      href={`/opportunities?category=${category.code}`}
                      className="inline-block border border-border-strong px-3 py-[7px] text-ctl text-secondary-text"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </Container>
      </section>
      <Container className="pt-[22px] pb-[65px]">
        <h2 className="text-title font-strong">Latest opportunities</h2>
        {rows.length > 0 ? (
          <div className="mt-2 border-t border-line" data-testid="latest">
            {rows.map((row) => (
              <OpportunityRow
                key={row.id}
                row={row}
                save={{ signedIn: Boolean(user), saved: savedIds.has(row.id), returnTo: "/" }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-base text-muted" data-testid="latest-empty">
            {latest.ok
              ? "New opportunities are added as they are checked."
              : "Opportunities are unavailable right now. Try again shortly."}
          </p>
        )}
        <p className="mt-4 text-ctl">
          <Link href="/opportunities" className="text-accent underline">
            See all opportunities
          </Link>
        </p>
      </Container>
    </>
  );
}
