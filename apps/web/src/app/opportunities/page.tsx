import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { OpportunityRow } from "@/components/opportunities/parts";
import { Button, ButtonLink, EmptyState, Notice, Panel, SearchGroup, Select, Tabs } from "@/components/ui";
import { listCategories, listLocations, listOpportunities } from "@/lib/catalog";
import { getCurrentUser, getSavedIds } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Opportunities",
  description: "Search jobs, internships, graduate programmes, scholarships, tenders and grants in Zimbabwe.",
  alternates: { canonical: "/opportunities" },
};

const FILTER_KEYS = [
  "q",
  "category",
  "location",
  "employment_type",
  "work_mode",
  "deadline_state",
  "sort",
  "limit",
] as const;
type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function href(params: URLSearchParams, change: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  next.delete("cursor");
  for (const [key, value] of Object.entries(change)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/opportunities?${query}` : "/opportunities";
}

const EMPLOYMENT = [
  ["permanent", "Permanent"],
  ["contract", "Contract"],
  ["temporary", "Temporary"],
  ["part_time", "Part time"],
  ["internship", "Internship"],
  ["trainee", "Trainee"],
] as const;
const MODES = [
  ["on_site", "On site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;
const DEADLINES = [
  ["open", "Open"],
  ["closing_soon", "Closing soon"],
  ["unknown", "Deadline not stated"],
] as const;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of [...FILTER_KEYS, "cursor"]) {
    const value = first(raw[key]);
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const [result, categories, locations, user] = await Promise.all([
    listOpportunities(params),
    listCategories(),
    listLocations(),
    getCurrentUser(),
  ]);
  const savedIds =
    user && result.ok ? await getSavedIds(result.data.data.map((row) => row.id)) : new Set<string>();
  const returnTo = href(params, {});
  const active = params.get("category");
  const keepForSearch = [...params.entries()].filter(([k]) => !["q", "category", "cursor"].includes(k));

  const tabs = [
    { href: href(params, { category: null }), label: "All", current: !active },
    ...categories.map((c) => ({
      href: href(params, { category: c.code }),
      label: c.name,
      current: active === c.code,
    })),
  ];

  return (
    <>
      <section aria-labelledby="results-title" className="border-b border-line py-[22px]">
        <Container>
          <h1 id="results-title" className="text-section font-strong tracking-section">
            Opportunities
          </h1>
          <p className="mt-1 mb-[14px] text-base text-muted">
            Every listing names its source. Applications happen on the issuer&apos;s own channel.
          </p>
          <SearchGroup action="/opportunities" method="get" aria-label="Search opportunities">
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
            {keepForSearch.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Button type="submit" size="search">
              Search
            </Button>
          </SearchGroup>
        </Container>
      </section>
      <Container>
        <Tabs label="Categories" items={tabs} />
      </Container>
      <Container className="grid grid-cols-[230px_1fr] gap-6 pt-[18px] pb-[65px] max-md:grid-cols-1">
        <Panel aria-label="Filters" className="max-md:order-first">
          <form action="/opportunities" method="get" className="grid gap-3 max-md:grid-cols-2">
            <h2 className="text-title font-strong max-md:col-span-2">Filters</h2>
            {params.get("q") ? <input type="hidden" name="q" value={params.get("q") ?? ""} /> : null}
            {active ? <input type="hidden" name="category" value={active} /> : null}
            {params.get("limit") ? (
              <input type="hidden" name="limit" value={params.get("limit") ?? ""} />
            ) : null}
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
              href={href(new URLSearchParams(), { q: params.get("q"), category: active })}
              className="text-ctl text-accent underline max-md:col-span-2"
            >
              Clear filters
            </Link>
          </form>
        </Panel>
        <section aria-labelledby="list-title" className="min-w-0">
          <h2 id="list-title" className="sr-only">
            Results
          </h2>
          <Results
            result={result}
            params={params}
            signedIn={Boolean(user)}
            savedIds={savedIds}
            returnTo={returnTo}
          />
        </section>
      </Container>
    </>
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

async function Results({
  result,
  params,
  signedIn,
  savedIds,
  returnTo,
}: {
  result: Awaited<ReturnType<typeof listOpportunities>>;
  params: URLSearchParams;
  signedIn: boolean;
  savedIds: Set<string>;
  returnTo: string;
}) {
  if (!result.ok) {
    const copy = {
      "invalid-query": [
        "Those filters could not be applied",
        "One of the search words or filters is not valid. Clear the filters and try again.",
      ],
      "rate-limited": ["Too many requests", "Wait a minute and try again."],
      unreachable: ["Opportunities are unavailable", "The service could not be reached. Try again shortly."],
      "unexpected-response": [
        "Something went wrong",
        "We could not load the opportunities. Try again shortly.",
      ],
    }[result.reason];
    return (
      <div role="alert">
        <EmptyState title={copy[0]!}>
          {copy[1]}
          {result.reason === "invalid-query" ? (
            <>
              {" "}
              <Link href="/opportunities" className="text-accent underline">
                Clear filters
              </Link>
            </>
          ) : null}
        </EmptyState>
      </div>
    );
  }
  const { data, page } = result.data;
  const count = page.total ?? data.length;
  const heading = params.get("cursor")
    ? `Showing more results`
    : `${count} ${count === 1 ? "opportunity" : "opportunities"}`;
  return (
    <>
      <p role="status" aria-live="polite" className="mb-2 text-ctl text-muted" data-testid="result-count">
        {heading}
      </p>
      {data.length === 0 ? (
        <EmptyState title="No opportunities match">
          Try different words or clear the filters. New opportunities are added as they are checked.
        </EmptyState>
      ) : (
        <div className="border-t border-line" data-testid="results">
          {data.map((row) => (
            <OpportunityRow
              key={row.id}
              row={row}
              save={{ signedIn, saved: savedIds.has(row.id), returnTo }}
            />
          ))}
        </div>
      )}
      {page.has_more && page.next_cursor ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
          <ButtonLink rel="next" variant="secondary" href={href(params, { cursor: page.next_cursor })}>
            Next page
          </ButtonLink>
          {params.get("cursor") ? (
            <Link href={href(params, {})} className="text-ctl text-accent underline">
              Back to the first page
            </Link>
          ) : null}
        </nav>
      ) : null}
      <Notice className="mt-6 border border-border-notice">
        Verification labels describe what UPNEXT checked. A listing that is not verified still names its
        source.
      </Notice>
    </>
  );
}
