"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Select, TextInput } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import type { AnalyticsOverview, AnalyticsPeriod } from "@/lib/staff-types";
import { AnalyticsPanel, AnalyticsSkeleton, PERIOD_LABEL } from "./analytics-panel";
import { AnalyticsTable, type DateRange } from "./analytics-table";

const PERIODS = Object.keys(PERIOD_LABEL) as AnalyticsPeriod[];

/**
 * The compact page header (title, short description, range selector and actions) and the figures under it. The
 * figures are fetched in the browser so the dashboard itself is never held up by the aggregation, and they say
 * what they are while they load (skeleton), when there is nothing yet (empty state) and when the request fails.
 * On the Analytics page (`full`) the ranked table and a date filter follow.
 */
export function AnalyticsView({
  title,
  description,
  actions,
  full = false,
  initialPeriod = "30d",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  full?: boolean;
  initialPeriod?: AnalyticsPeriod;
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialPeriod);
  const [range, setRange] = useState<DateRange | null>(null);
  const [draft, setDraft] = useState<DateRange>({ from: "", to: "" });
  const [rangeProblem, setRangeProblem] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<{
    key: string;
    data: AnalyticsOverview | null;
    problem: string | null;
  } | null>(null);
  const key = `${period}|${retry}`;

  useEffect(() => {
    let current = true;
    void apiFetch<AnalyticsOverview>("GET", `staff/analytics?period=${period}`).then((result) => {
      if (!current) return;
      setView(
        result.ok
          ? { key, data: result.data, problem: null }
          : { key, data: null, problem: describeFailure(result) },
      );
    });
    return () => {
      current = false;
    };
  }, [key, period]);

  function applyRange() {
    if (!draft.from || !draft.to) return setRangeProblem("Choose both dates.");
    if (draft.to < draft.from) return setRangeProblem("The end date is before the start date.");
    setRangeProblem(null);
    setRange(draft);
  }

  const loading = view?.key !== key;
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-title font-light tracking-title">{title}</h1>
          {description ? <p className="m-0 mt-0.5 max-w-[60ch] text-ctl text-muted">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label htmlFor="a-period" className="text-small text-muted">
              Period
            </label>
            <Select
              id="a-period"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as AnalyticsPeriod);
                setRange(null);
              }}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          {actions}
        </div>
      </header>

      {view?.problem ? (
        <p
          role="alert"
          className="m-0 rounded-card border border-danger/40 bg-danger-bg p-3 text-ctl text-danger"
        >
          <span className="font-strong">Error:</span> The analytics could not be loaded. {view.problem}{" "}
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </Button>
        </p>
      ) : loading && !view?.data ? (
        <AnalyticsSkeleton />
      ) : view?.data ? (
        <div aria-busy={loading} className={loading ? "opacity-70" : undefined}>
          <AnalyticsPanel data={view.data} />
        </div>
      ) : null}

      {full ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyRange();
            }}
            noValidate
            aria-label="Filter the table by date"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="grid gap-1">
              <label htmlFor="a-from" className="text-small text-muted">
                From (Harare date)
              </label>
              <TextInput
                id="a-from"
                type="date"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="a-to" className="text-small text-muted">
                To
              </label>
              <TextInput
                id="a-to"
                type="date"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </div>
            <Button type="submit" variant="secondary">
              Apply dates
            </Button>
            {range ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setRange(null);
                  setDraft({ from: "", to: "" });
                }}
              >
                Clear dates
              </Button>
            ) : null}
            <p className="m-0 basis-full text-small text-muted" role={rangeProblem ? "alert" : undefined}>
              {rangeProblem ??
                (range
                  ? `The table shows ${range.from} to ${range.to} (both days included, Harare time). Hourly figures exist only from the date counting began.`
                  : `The table follows the period above: ${PERIOD_LABEL[period].toLowerCase()}.`)}
            </p>
          </form>
          <AnalyticsTable period={period} range={range} />
        </>
      ) : (
        <p className="m-0 text-ctl">
          <Link href="/workspace/analytics" className="text-accent">
            Open the full Analytics page
          </Link>
        </p>
      )}
    </div>
  );
}
