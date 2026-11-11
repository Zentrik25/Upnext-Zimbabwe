import Link from "next/link";
import { HomeListingRow } from "@/components/home/home-row";
import { CategoryCard, GuideCard, SectionHeading } from "@/components/public/cards";
import { Container } from "@/components/layout";
import { LoadingRegion, SkeletonLine } from "@/components/ui/skeleton";
import { SkeletonHomeRow } from "@/components/ui";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { listLocations, listOpportunities } from "@/lib/catalog";
import { GUIDES } from "@/lib/guides";
import { getCurrentUser, getSavedIds } from "@/lib/session";

export function BrowseByCategory() {
  return (
    <section aria-labelledby="cat-title" className="py-8 max-sm:py-6">
      <Container>
        <SectionHeading
          id="cat-title"
          title="Browse by category"
          href="/categories"
          linkLabel="All categories"
        />
        <ul className="m-0 mt-4 grid list-none grid-cols-3 gap-3 p-0 max-md:grid-cols-2 max-sm:grid-cols-1">
          {Object.keys(CATEGORY_SEO).map((code) => (
            <li key={code}>
              <CategoryCard code={code} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Places come from the catalogue; nothing is drawn if it cannot be read or holds none. */
export async function BrowseByLocation() {
  const places = (await listLocations())
    .filter((l) => l.slug !== "remote" && (l.kind === "city" || l.kind === "town" || l.kind === "province"))
    .slice(0, 12);
  if (places.length === 0) return null;
  return (
    <section aria-labelledby="loc-title" className="py-8 max-sm:py-6">
      <Container>
        <SectionHeading
          id="loc-title"
          title="Browse by location"
          href="/locations"
          linkLabel="All locations"
        />
        <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
          {places.map((l) => (
            <li key={l.slug}>
              <Link
                href={`/opportunities?location=${l.slug}`}
                className="inline-flex min-h-[44px] items-center rounded-pill border border-line bg-surface px-4 text-ctl text-ink hover:bg-surface-pale"
              >
                {l.name}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function BrowseLocationSkeleton() {
  return (
    <section className="py-8 max-sm:py-6">
      <Container>
        <LoadingRegion label="locations" heading={false} className="grid gap-3">
          <SkeletonLine className="h-[24px] w-[200px]" />
          <SkeletonLine className="h-[44px] w-full" />
        </LoadingRegion>
      </Container>
    </section>
  );
}

/** Graduate programmes and internships, newest first. Drawn only when there are real listings: no empty heading. */
export async function EntryLevel() {
  const [grad, intern, user] = await Promise.all([
    listOpportunities(new URLSearchParams({ category: "graduate-programmes", limit: "3" })),
    listOpportunities(new URLSearchParams({ category: "internships", limit: "3" })),
    getCurrentUser(),
  ]);
  const rows = [...(grad.ok ? grad.data.data : []), ...(intern.ok ? intern.data.data : [])].slice(0, 4);
  if (rows.length === 0) return null;
  const savedIds = user ? await getSavedIds(rows.map((r) => r.id)) : new Set<string>();
  return (
    <section aria-labelledby="entry-title" className="py-8 max-sm:py-6">
      <Container>
        <SectionHeading
          id="entry-title"
          title="Graduate and entry-level opportunities"
          href="/opportunities?category=graduate-programmes"
          linkLabel="View graduate programmes"
        />
        <div className="mt-4 grid gap-3" data-testid="entry-level">
          {rows.map((row) => (
            <HomeListingRow
              key={row.id}
              row={row}
              save={{ signedIn: Boolean(user), saved: savedIds.has(row.id), returnTo: "/" }}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}

export function EntryLevelSkeleton() {
  return (
    <section className="py-8 max-sm:py-6">
      <Container>
        <LoadingRegion label="graduate and entry-level opportunities" heading={false} className="grid gap-3">
          <SkeletonHomeRow />
          <SkeletonHomeRow />
        </LoadingRegion>
      </Container>
    </section>
  );
}

export function CareerGuides() {
  return (
    <section aria-labelledby="guides-title" className="py-8 max-sm:py-6">
      <Container>
        <SectionHeading id="guides-title" title="Career guides" href="/guides" linkLabel="All guides" />
        <ul className="m-0 mt-4 grid list-none grid-cols-3 gap-3 p-0 max-md:grid-cols-1">
          {GUIDES.slice(0, 3).map((g) => (
            <li key={g.path}>
              <GuideCard guide={g} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function EmployerCta() {
  return (
    <section aria-labelledby="emp-title" className="py-8 max-sm:py-6">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-feature bg-surface-pale p-8 max-sm:p-5">
          <div className="max-w-[56ch]">
            <h2 id="emp-title" className="m-0 text-sub">
              Hiring in Zimbabwe?
            </h2>
            <p className="mt-2 text-base text-muted">
              Register your organisation to submit opportunities. Every listing is reviewed by our editors
              before it is published.
            </p>
          </div>
          <Link
            href="/employers"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-pill bg-accent-solid px-6 text-base text-on-accent hover:bg-accent-solid-hover"
          >
            For employers
          </Link>
        </div>
      </Container>
    </section>
  );
}
