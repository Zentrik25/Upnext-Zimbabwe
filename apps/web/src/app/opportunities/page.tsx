import { DEADLINES, EMPLOYMENT, MODES } from "@/lib/filters";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { socialFor } from "@/lib/brand";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { classifyList, LIST_KEYS } from "@/lib/list-seo";
import { unavailable } from "@/lib/unavailable";
import Link from "next/link";
import { Container } from "@/components/layout";
import { fetchList, listHref, ResultsLoader } from "@/components/opportunities/results";
import { Button, Panel, SearchGroup, Select, Tabs } from "@/components/ui";
import { FiltersSkeleton, ResultsSkeleton, SearchSkeleton } from "@/components/opportunities/skeletons";
import { SkeletonTabs } from "@/components/ui/skeleton";
import { listCategories, listLocations } from "@/lib/catalog";
import { JsonLd } from "@/components/seo/json-ld";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
const BASE_DESCRIPTION =
  "Search the latest jobs, tenders, internships, graduate trainee programmes, scholarships and grants in Zimbabwe, each shown with a clear verification label.";
/** The plain list is priority destination 1, "Jobs & opportunities in Zimbabwe" (D-69). */
const PLAIN_TITLE = "Jobs & Opportunities in Zimbabwe";
const PLAIN_HEADING = "Jobs and opportunities in Zimbabwe";

/**
 * Indexing rules (see `classifyList`): the plain list and the list of one known category are indexed, each with its own
 * title and a canonical address of its own. A later page is a page of its own (noindex, follow, canonical to itself, never
 * to page one). A searched, filtered, sorted or resized list is a view of the same listings: noindex, follow, canonical
 * to the nearest indexable list. Listings themselves are found through the sitemap and the crawlable links below.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const view = classifyList(await searchParams);
  const copy = view.kind === "category" ? CATEGORY_SEO[view.category] : undefined;
  // An address that would be indexed must hold genuine opportunities: an empty list is `noindex, follow`. A list
  // that could not be loaded is a server error instead (lib/unavailable.ts): it is not indexed either, but a crawler
  // keeps the copy it already has rather than being told to drop a live page because of a passing fault.
  let index: boolean = view.index;
  if (view.index) {
    const found = await fetchList(view.kind === "category" ? `category=${view.category}` : "");
    if (!found.ok && found.reason !== "invalid-query") unavailable(found.reason);
    index = found.ok && found.data.data.length > 0;
  }
  const title = copy?.title ?? (view.kind === "plain" ? PLAIN_TITLE : "Opportunities");
  const description = copy?.description ?? BASE_DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: view.canonical },
    ...socialFor(view.canonical, { title, description }),
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

const FILTER_KEYS = LIST_KEYS;

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The categories are asked for by the search box, the tabs and nothing else: one request for all of them. */
const categoriesOnce = cache(listCategories);

/**
 * The heading and the explanation are sent at once. The search box and the tabs (categories), the filters
 * (locations) and the results (the list) each wait in a Suspense boundary of their own, so a slow list does not hold
 * back the controls and a slow category list does not hold back the results. Nothing here decides the status
 * code, which is why a boundary is safe on this public page (a route-level loading file would not be).
 */
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of [...FILTER_KEYS, "cursor"]) {
    const value = first(raw[key]);
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const active = params.get("category");
  const view = classifyList(raw);
  const headingCategory = view.kind === "category" ? active : null;
  const copy = headingCategory ? CATEGORY_SEO[headingCategory] : undefined;

  return (
    <>
      {copy && headingCategory ? (
        <JsonLd
          data={breadcrumbFor([
            { name: "Opportunities", url: absolute("/opportunities") },
            { name: copy.heading, url: absolute(`/opportunities?category=${headingCategory}`) },
          ])}
        />
      ) : null}
      <section aria-labelledby="results-title" className="border-b border-line py-[22px]">
        <Container>
          <h1 id="results-title" className="text-section font-strong tracking-section">
            {copy ? copy.heading : view.kind === "plain" ? PLAIN_HEADING : "Opportunities"}
          </h1>
          {/* Indexable lists say what they hold (their own text, not just metadata); every list says how to apply. */}
          <p className="mt-1 mb-[14px] max-w-[760px] text-base text-muted">
            {copy ? `${copy.description} ` : view.kind === "plain" ? `${BASE_DESCRIPTION} ` : ""}
            Applications happen on the issuer&apos;s own channel.
          </p>
          <Suspense fallback={<SearchSkeleton />}>
            <SearchControls params={params} />
          </Suspense>
        </Container>
      </section>
      <Container>
        <Suspense fallback={<SkeletonTabs />}>
          <CategoryTabs params={params} />
        </Suspense>
      </Container>
      <Container className="grid grid-cols-[230px_1fr] gap-6 pt-[18px] pb-[65px] max-md:grid-cols-1">
        <Panel aria-label="Filters" className="max-md:order-first">
          <Suspense fallback={<FiltersSkeleton />}>
            <FilterForm params={params} />
          </Suspense>
        </Panel>
        <section aria-labelledby="list-title" className="min-w-0">
          <h2 id="list-title" className="sr-only">
            Results
          </h2>
          <Suspense fallback={<ResultsSkeleton />}>
            <ResultsLoader params={params} />
          </Suspense>
        </section>
      </Container>
    </>
  );
}

async function SearchControls({ params }: { params: URLSearchParams }) {
  const categories = await categoriesOnce();
  const active = params.get("category");
  const keepForSearch = [...params.entries()].filter(([k]) => !["q", "category", "cursor"].includes(k));
  return (
    <SearchGroup action="/opportunities" method="get" aria-label="Search opportunities">
      {keepForSearch.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="q" className="sr-only">
        Search by title, organisation or keyword
      </label>
      <SearchGroup.Input
        id="q"
        name="q"
        type="search"
        maxLength={100}
        defaultValue={params.get("q") ?? ""}
        placeholder="Title, organisation or keyword"
      />
      <label htmlFor="category" className="sr-only">
        Category
      </label>
      <SearchGroup.Select id="category" name="category" defaultValue={active ?? ""}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </SearchGroup.Select>
    </SearchGroup>
  );
}

async function CategoryTabs({ params }: { params: URLSearchParams }) {
  const categories = await categoriesOnce();
  const active = params.get("category");
  const tabs = [
    { href: listHref(params, { category: null }), label: "All", current: !active },
    ...categories.map((c) => ({
      href: listHref(params, { category: c.code }),
      label: c.name,
      current: active === c.code,
    })),
  ];
  return <Tabs label="Categories" items={tabs} />;
}

async function FilterForm({ params }: { params: URLSearchParams }) {
  const locations = await listLocations();
  const active = params.get("category");
  return (
    <form action="/opportunities" method="get" className="grid gap-3 max-md:grid-cols-2">
      <h2 className="text-title font-strong max-md:col-span-2">Filters</h2>
      {params.get("q") ? <input type="hidden" name="q" value={params.get("q") ?? ""} /> : null}
      {active ? <input type="hidden" name="category" value={active} /> : null}
      {params.get("limit") ? <input type="hidden" name="limit" value={params.get("limit") ?? ""} /> : null}
      <FilterSelect
        id="location"
        label="Location"
        value={params.get("location")}
        all="Any location"
        options={locations
          .filter((l) => l.kind !== "remote" && l.kind !== "country")
          .map((l) => [l.slug, l.name] as const)}
      />
      <FilterSelect
        id="employment_type"
        label="Type of work"
        value={params.get("employment_type")}
        all="Any type"
        options={EMPLOYMENT}
      />
      <FilterSelect
        id="work_mode"
        label="Work arrangement"
        value={params.get("work_mode")}
        all="Any arrangement"
        options={MODES}
      />
      <FilterSelect
        id="deadline_state"
        label="Deadline"
        value={params.get("deadline_state")}
        all="Any deadline"
        options={DEADLINES}
      />
      <FilterSelect
        id="sort"
        label="Sort by"
        value={params.get("sort")}
        all="Newest first"
        options={[
          ["closing_soon", "Closing soonest"],
          ...(params.get("q") ? [["relevance", "Best match"] as const] : []),
        ]}
      />
      <Button type="submit" className="max-md:col-span-2">
        Apply filters
      </Button>
      <Link
        href={listHref(new URLSearchParams(), { q: params.get("q"), category: active })}
        className="inline-flex min-h-[44px] items-center text-ctl text-accent underline max-md:col-span-2"
      >
        Clear filters
      </Link>
    </form>
  );
}

function FilterSelect(props: {
  id: string;
  label: string;
  value: string | null;
  all: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="grid gap-[5px]">
      <label htmlFor={props.id} className="text-small font-strong">
        {props.label}
      </label>
      <Select id={props.id} name={props.id} defaultValue={props.value ?? ""}>
        <option value="">{props.all}</option>
        {props.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  );
}
