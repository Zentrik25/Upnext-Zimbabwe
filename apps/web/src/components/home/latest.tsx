import { HomeListingRow } from "@/components/home/home-row";
import { SectionError, SkeletonHomeRow } from "@/components/ui";
import { LoadingRegion } from "@/components/ui/skeleton";
import { listOpportunities } from "@/lib/catalog";
import { getCurrentUser, getSavedIds } from "@/lib/session";

const BOX = "mt-3 overflow-hidden rounded-feature border border-border-panel bg-surface";

/** The latest listings while they load: the same box and the same six rows, so the real rows replace them in place. */
export function HomeLatestSkeleton() {
  return (
    <LoadingRegion label="the latest opportunities" heading={false} className={BOX}>
      {Array.from({ length: 6 }, (_, index) => (
        <SkeletonHomeRow key={index} />
      ))}
    </LoadingRegion>
  );
}

/**
 * The latest listings, in their own Suspense boundary on the home page. Three outcomes and no others: rows, a
 * genuine empty list, or a failed request with a retry. A failed request is never described as an empty list, and
 * nothing here is invented: with no rows nothing is drawn in their place.
 */
export async function HomeLatest() {
  const [latest, user] = await Promise.all([
    listOpportunities(new URLSearchParams({ limit: "6" })),
    getCurrentUser(),
  ]);
  if (!latest.ok) {
    return (
      <SectionError title="Opportunities are unavailable right now" className="mt-4" as="h3">
        Try again shortly.
      </SectionError>
    );
  }
  const rows = latest.data.data;
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-base text-muted" data-testid="latest-empty">
        New opportunities are added as they are checked.
      </p>
    );
  }
  const savedIds = user ? await getSavedIds(rows.map((row) => row.id)) : new Set<string>();
  return (
    <div className={BOX} data-testid="latest">
      {rows.map((row) => (
        <HomeListingRow
          key={row.id}
          row={row}
          save={{ signedIn: Boolean(user), saved: savedIds.has(row.id), returnTo: "/" }}
        />
      ))}
    </div>
  );
}
