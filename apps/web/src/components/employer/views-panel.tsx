"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Select } from "@/components/ui";
import { TrafficChart } from "@/components/workspace/analytics/traffic-chart";
import { apiFetch } from "@/lib/client-api";
import { PERIODS, type DashboardData, type Period } from "@/lib/employer-types";
import { count, formatDate } from "@/lib/staff-format";

const BUCKET_TITLE = { hour: "per hour", day: "per day", week: "per week", month: "per month" } as const;

function Change({ value, previous, label }: { value: number | null; previous: boolean; label: string }) {
  if (!previous) return <p className="m-0 text-small text-muted">Since counting began</p>;
  if (value === null) return <p className="m-0 text-small text-muted">No earlier period to compare with</p>;
  const up = value >= 0;
  return (
    <p className={`m-0 text-small ${up ? "text-good" : "text-danger"}`}>
      <span aria-hidden="true">{up ? "↑" : "↓"}</span> {Math.abs(value)}%
      <span className="sr-only">{up ? " more" : " fewer"}</span>{" "}
      <span className="text-muted">from previous {label}</span>
    </p>
  );
}

/**
 * The Opportunity Views panel: a range selector, the views chart, totals with the change against the period
 * before, apply clicks (clicks on Apply, never applications) and the most viewed listings. The first period
 * comes from the server; choosing another asks the API again, always for the signed-in member's own
 * organisation. Nothing is estimated: quiet hours and days are zeros.
 */
export function ViewsPanel({
  organisationId,
  initial,
  showTop = true,
}: {
  organisationId: string;
  initial: DashboardData;
  showTop?: boolean;
}) {
  const id = useId();
  const [period, setPeriod] = useState<Period>(initial.period);
  const [data, setData] = useState<DashboardData>(initial);
  const [state, setState] = useState<"ready" | "loading" | "failed">("ready");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    setState("loading");
    void apiFetch<DashboardData>(
      "GET",
      `employer/organisations/${organisationId}/dashboard?period=${period}`,
    ).then((outcome) => {
      if (!live) return;
      if (outcome.ok) {
        setData(outcome.data);
        setState("ready");
      } else setState("failed");
    });
    return () => {
      live = false;
    };
  }, [period, organisationId]);

  const label = PERIODS.find((p) => p.value === data.period)?.label ?? "";
  const unit = data.period === "24h" ? "24 hours" : data.period === "all" ? "" : label.replace("Last ", "");
  const hasPrevious = data.traffic.previous !== null;
  const { tracking } = data;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-card border border-border-panel bg-surface p-4 sm:p-5"
      data-testid="views-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="m-0 text-title font-strong tracking-title">
          Opportunity Views
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-period`} className="sr-only">
            Period
          </label>
          <Select
            id={`${id}-period`}
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
            className="min-w-[150px]"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p role="status" className="sr-only">
        {state === "loading" ? "Loading" : state === "failed" ? "The figures could not be loaded" : ""}
      </p>
      {state === "failed" ? (
        <p className="m-0 mt-2 text-ctl text-danger" role="alert">
          The figures for that period could not be loaded. Try again.
        </p>
      ) : null}
      <div
        className={`mt-3 grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_260px] ${state === "loading" ? "opacity-60" : ""}`}
      >
        <div className="min-w-0">
          <TrafficChart
            points={data.chart.points}
            bucket={data.chart.bucket}
            label={`Views ${BUCKET_TITLE[data.chart.bucket]}, ${label.toLowerCase()}`}
          />
        </div>
        <div className="grid content-start gap-4 min-[1100px]:border-l min-[1100px]:border-line min-[1100px]:pl-5">
          <div>
            <p className="m-0 text-ctl text-ink">Total Views</p>
            <p
              className="m-0 text-[30px] leading-[1.15] font-light tracking-title tabular-nums"
              data-testid="total-views"
            >
              {count(data.traffic.views)}
            </p>
            <Change value={data.traffic.change.views} previous={hasPrevious} label={unit} />
          </div>
          <div className="border-t border-line pt-4">
            <p className="m-0 text-ctl text-ink">Application Clicks</p>
            <p
              className="m-0 text-[30px] leading-[1.15] font-light tracking-title tabular-nums"
              data-testid="total-clicks"
            >
              {count(data.traffic.apply_clicks)}
            </p>
            <Change value={data.traffic.change.apply_clicks} previous={hasPrevious} label={unit} />
            <p className="m-0 mt-1 text-small text-muted">
              Clicks on Apply. Not applications: UPNEXT never receives them.
            </p>
          </div>
        </div>
      </div>
      {showTop ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="m-0 text-base font-strong">Most viewed ({label.toLowerCase()})</h3>
          {data.most_viewed.length === 0 ? (
            <p className="m-0 mt-1 text-ctl text-muted">
              No views recorded for your listings in this period.
            </p>
          ) : (
            <ol className="m-0 mt-2 grid list-none gap-1 p-0" data-testid="most-viewed">
              {data.most_viewed.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 text-ctl">
                  <Link href={`/employer/listings/${row.id}`} className="text-accent underline">
                    {row.title}
                  </Link>
                  <span className="tabular-nums text-muted">
                    {count(row.views)} views · {count(row.apply_clicks)} apply clicks
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
      <p className="m-0 mt-4 text-small text-muted" data-testid="tracking-note">
        {tracking.daily_since || tracking.hourly_since
          ? `Counting began on ${formatDate(tracking.daily_since ?? tracking.hourly_since)}; nothing before that is estimated. `
          : "No views have been recorded yet. "}
        {data.note}
      </p>
    </section>
  );
}
