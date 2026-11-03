import Link from "next/link";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/skeleton";
import { count, formatDate, formatDateTime } from "@/lib/staff-format";
import type { AnalyticsOverview, AnalyticsPeriod } from "@/lib/staff-types";
import { Metric } from "./metric";
import { TrafficChart } from "./traffic-chart";

export const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};
const BUCKET_TITLE = { hour: "per hour", day: "per day", week: "per week", month: "per month" } as const;

const panel = "min-w-0 rounded-card border border-border-panel bg-surface";
const h2 = "m-0 text-title font-normal tracking-title";

/** Placeholders the size of the real figures, so the page does not jump when the numbers arrive. */
export function AnalyticsSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-2 rounded-card border border-line p-3">
            <SkeletonLine className="w-1/2" />
            <SkeletonBlock className="h-[26px] w-2/3" />
          </div>
        ))}
      </div>
      <div className={`${panel} p-4`}>
        <SkeletonLine className="mb-3 w-[180px]" />
        <SkeletonBlock className="h-[200px]" />
      </div>
    </div>
  );
}

/** The message that says what the figures cover, so a gap in history is explained and never filled in. */
function TrackingNote({ data }: { data: AnalyticsOverview }) {
  const { hourly_since: hourly, daily_since: daily } = data.tracking;
  if (!hourly && !daily)
    return (
      <p className="m-0 text-small text-muted" data-testid="tracking-note">
        No views have been recorded yet. Counting starts when a published listing is opened by a visitor.
      </p>
    );
  return (
    <p className="m-0 text-small text-muted" data-testid="tracking-note">
      Counting began on {formatDate(daily ?? hourly)}
      {hourly ? `; hourly and rolling figures are available from ${formatDateTime(hourly)}` : ""}. Nothing
      before that is estimated: earlier days appear only in the all-time total. Views are page views (one per
      browser tab session); unique visitors are not measured. Apply clicks are clicks on Apply, not submitted
      applications.
    </p>
  );
}

/** The figures above the table: traffic cards, engagement, chart, listing counts and the two short lists. */
export function AnalyticsPanel({ data }: { data: AnalyticsOverview }) {
  const { traffic, operations, chart } = data;
  const empty = traffic.all_time.views === 0;
  return (
    <div className="grid gap-4">
      <section aria-labelledby="traffic-title">
        <h2 id="traffic-title" className="sr-only">
          Traffic
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="All-time views" value={traffic.all_time.views} note="Since counting began" />
          <Metric label="Last 24 hours" value={traffic.last_24_hours.views} note="Rolling" />
          <Metric label="Last 7 days" value={traffic.last_7_days.views} note="Rolling" />
          <Metric label="Last 30 days" value={traffic.last_30_days.views} note="Rolling" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric
            label="Apply clicks"
            value={chart.apply_clicks}
            note={`${PERIOD_LABEL[data.period]}, not applications`}
          />
          <Metric label="Saved by visitors" value={data.saves} note="Currently saved" />
          <Metric label="Unique visitors" value="Not measured" note="No visitor identifier is kept" />
          <Metric label="Views in period" value={chart.views} note={PERIOD_LABEL[data.period]} />
        </div>
        <div className="mt-2">
          <TrackingNote data={data} />
        </div>
      </section>

      <section aria-labelledby="chart-title" className={`${panel} p-4`}>
        <h2 id="chart-title" className={`${h2} mb-3`}>
          Views {BUCKET_TITLE[chart.bucket]}
          <span className="ml-2 text-ctl font-light text-muted">{PERIOD_LABEL[data.period]}</span>
        </h2>
        {empty ? (
          <p className="m-0 py-8 text-center text-ctl text-muted">
            No views recorded yet, so there is nothing to chart. Figures appear as visitors open published
            listings.
          </p>
        ) : (
          <TrafficChart
            points={chart.points}
            bucket={chart.bucket}
            label={`Views ${BUCKET_TITLE[chart.bucket]}`}
          />
        )}
      </section>

      <section aria-labelledby="ops-title">
        <h2 id="ops-title" className="sr-only">
          Opportunities
        </h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-5">
          {(
            [
              ["Published", operations.published, "/workspace/opportunities?status=published"],
              ["Active", operations.active, "/workspace/opportunities?status=published"],
              ["Expired", operations.expired, "/workspace/opportunities?status=expired"],
              ["Drafts", operations.draft, "/workspace/opportunities?status=draft"],
              [
                "Awaiting verification",
                operations.awaiting_verification,
                "/workspace/opportunities?status=published&verified=no",
              ],
            ] as const
          ).map(([label, value, href]) => (
            <li key={label}>
              <Metric label={label} value={value} href={href} />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="top-title" className={panel}>
          <h2 id="top-title" className={`${h2} px-4 pt-3 pb-2`}>
            Most viewed
            <span className="ml-2 text-ctl font-light text-muted">{PERIOD_LABEL[data.period]}</span>
          </h2>
          {data.most_viewed.length ? (
            <ol className="m-0 list-none p-0">
              {data.most_viewed.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-t border-line px-4 py-2 text-ctl">
                  <Link
                    href={`/workspace/opportunities/${r.id}`}
                    className="min-w-0 flex-1 text-accent [overflow-wrap:anywhere]"
                  >
                    {r.title}
                    <span className="block text-small text-muted">{r.organisation}</span>
                  </Link>
                  <span className="tabular-nums">{count(r.views)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 border-t border-line px-4 py-4 text-ctl text-muted">
              No listing has been viewed in this period.
            </p>
          )}
        </section>
        <section aria-labelledby="recent-title" className={panel}>
          <h2 id="recent-title" className={`${h2} px-4 pt-3 pb-2`}>
            Recently viewed
          </h2>
          {data.recently_viewed.length ? (
            <ul className="m-0 list-none p-0">
              {data.recently_viewed.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-t border-line px-4 py-2 text-ctl">
                  <Link
                    href={`/workspace/opportunities/${r.id}`}
                    className="min-w-0 flex-1 text-accent [overflow-wrap:anywhere]"
                  >
                    {r.title}
                    <span className="block text-small text-muted">{r.organisation}</span>
                  </Link>
                  <time dateTime={r.last_viewed_hour} className="text-small whitespace-nowrap text-muted">
                    {formatDateTime(r.last_viewed_hour)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 border-t border-line px-4 py-4 text-ctl text-muted">No views recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
