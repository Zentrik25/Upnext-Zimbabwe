import Link from "next/link";
import { cache } from "react";
import { ButtonLink, EmptyState, Notice, SectionError } from "@/components/ui";
import { OpportunityRow } from "@/components/opportunities/parts";
import { listOpportunities } from "@/lib/catalog";
import { getCurrentUser, getSavedIds } from "@/lib/session";

/** One API request per distinct query for the metadata and the page of the same render. */
export const fetchList = cache((query: string) => listOpportunities(new URLSearchParams(query)));

export function listHref(params: URLSearchParams, change: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  next.delete("cursor");
  for (const [key, value] of Object.entries(change)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/opportunities?${query}` : "/opportunities";
}

export async function ResultsLoader({ params }: { params: URLSearchParams }) {
  const [result, user] = await Promise.all([fetchList(params.toString()), getCurrentUser()]);
  const savedIds =
    user && result.ok ? await getSavedIds(result.data.data.map((row) => row.id)) : new Set<string>();
  return (
    <Results
      result={result}
      params={params}
      signedIn={Boolean(user)}
      savedIds={savedIds}
      returnTo={listHref(params, {})}
    />
  );
}

export async function Results({
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
    // A bad filter is not a transient failure: retrying the same address cannot help, clearing the filters can.
    if (result.reason === "invalid-query") {
      return (
        <div role="alert">
          <EmptyState title="Those filters could not be applied">
            One of the search words or filters is not valid. Clear the filters and try again.{" "}
            <Link href="/opportunities" className="text-accent underline">
              Clear filters
            </Link>
          </EmptyState>
        </div>
      );
    }
    const copy = {
      "rate-limited": ["Too many requests", "Wait a minute and try again."],
      unreachable: ["Opportunities are unavailable", "The service could not be reached. Try again shortly."],
      "unexpected-response": [
        "Something went wrong",
        "We could not load the opportunities. Try again shortly.",
      ],
    }[result.reason];
    return <SectionError title={copy[0]!}>{copy[1]}</SectionError>;
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
          <ButtonLink rel="next" variant="secondary" href={listHref(params, { cursor: page.next_cursor })}>
            Next page
          </ButtonLink>
          {params.get("cursor") ? (
            <Link
              href={listHref(params, {})}
              className="inline-flex min-h-[44px] items-center text-ctl text-accent underline"
            >
              Back to the first page
            </Link>
          ) : null}
        </nav>
      ) : null}
      <Notice className="mt-6 rounded-card border border-border-notice">
        Verification labels describe what UPNEXT checked. A listing that is not verified still names its
        source.
      </Notice>
    </>
  );
}
