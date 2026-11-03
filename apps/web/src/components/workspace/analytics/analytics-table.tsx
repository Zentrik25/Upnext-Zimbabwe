"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Select, TextInput } from "@/components/ui";
import { SkeletonTable } from "@/components/ui/skeleton";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { count, formatDate, percent } from "@/lib/staff-format";
import type { AnalyticsPeriod, AnalyticsTable as TableData } from "@/lib/staff-types";

type Sort = "views" | "all_views" | "clicks" | "ctr" | "published" | "title";
export type DateRange = { from: string; to: string };

const th =
  "border-t border-line bg-surface-pale px-3 py-2 text-left text-small font-normal whitespace-nowrap text-muted";
const td = "border-t border-line px-3 py-2 align-middle text-ctl text-ink";

/**
 * The listings ranked by views in the chosen period, with search, sorting, paging and a date range. The click-through
 * rate is apply clicks divided by views of the same window and is blank when that window has no views.
 */
export function AnalyticsTable({ period, range }: { period: AnalyticsPeriod; range: DateRange | null }) {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("views");
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<{ key: string; data: TableData | null; problem: string | null } | null>(
    null,
  );
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(term.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const rangeKey = range ? `${range.from}|${range.to}` : "";
  const key = [period, rangeKey, q, sort, desc, page, retry].join("|");
  const path = useCallback(() => {
    const params = new URLSearchParams({
      sort,
      dir: desc ? "desc" : "asc",
      page: String(page),
      page_size: "15",
    });
    if (range) {
      params.set("from", range.from);
      params.set("to", range.to);
    } else params.set("period", period);
    if (q) params.set("q", q);
    return `staff/analytics/opportunities?${params.toString()}`;
  }, [period, range, q, sort, desc, page]);

  useEffect(() => {
    let current = true;
    void apiFetch<TableData>("GET", path()).then((result) => {
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
  }, [key, path]);

  const loading = view?.key !== key;
  const data = view?.data ?? null;

  function sortBy(next: Sort) {
    if (next === sort) setDesc((d) => !d);
    else {
      setSort(next);
      setDesc(next !== "title");
    }
    setPage(1);
  }
  const head = (label: string, by: Sort, right = false) => (
    <th
      scope="col"
      className={`${th} ${right ? "text-right" : ""}`}
      aria-sort={sort === by ? (desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => sortBy(by)}
        className="cursor-pointer border-0 bg-transparent p-0 text-small text-muted hover:text-ink"
      >
        {label}
        <span aria-hidden="true">{sort === by ? (desc ? " ↓" : " ↑") : ""}</span>
      </button>
    </th>
  );

  return (
    <section
      aria-labelledby="table-title"
      className="min-w-0 rounded-card border border-border-panel bg-surface"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3 pb-3">
        <h2 id="table-title" className="m-0 text-title font-normal tracking-title">
          Top-performing opportunities
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label htmlFor="a-search" className="text-small text-muted">
              Search title or organisation
            </label>
            <TextInput
              id="a-search"
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-[220px] max-w-full"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="a-sort" className="text-small text-muted">
              Sort by
            </label>
            <Select
              id="a-sort"
              value={`${sort}`}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                setDesc(e.target.value !== "title");
                setPage(1);
              }}
            >
              <option value="views">Views in period</option>
              <option value="all_views">All-time views</option>
              <option value="clicks">Apply clicks</option>
              <option value="ctr">Click-through rate</option>
              <option value="published">Publication date</option>
              <option value="title">Job title</option>
            </Select>
          </div>
        </div>
      </div>
      {view?.problem ? (
        <p role="alert" className="m-0 border-t border-line px-4 py-4 text-ctl text-danger">
          <span className="font-strong">Error:</span> {view.problem}{" "}
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </Button>
        </p>
      ) : loading && !data ? (
        <div aria-hidden="true" className="border-t border-line">
          <SkeletonTable rows={8} columns={6} />
        </div>
      ) : data && data.data.length ? (
        <>
          <div className="max-md:hidden" aria-busy={loading}>
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Opportunities ranked by views. Click-through rate is apply clicks divided by views of the same
                period.
              </caption>
              <thead>
                <tr>
                  {head("Job title", "title")}
                  <th scope="col" className={th}>
                    Organisation
                  </th>
                  {head("Published", "published")}
                  {head("Views in period", "views", true)}
                  {head("All-time views", "all_views", true)}
                  {head("Apply clicks", "clicks", true)}
                  {head("Click-through rate", "ctr", true)}
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id} className="hover:bg-row-hover">
                    <th scope="row" className={`${td} max-w-[300px] text-left font-normal`}>
                      <Link href={`/workspace/opportunities/${r.id}`} className="text-accent hover:underline">
                        {r.title}
                      </Link>
                    </th>
                    <td className={td}>{r.organisation}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(r.published_at)}</td>
                    <td className={`${td} text-right tabular-nums`}>{count(r.views)}</td>
                    <td className={`${td} text-right tabular-nums`}>{count(r.all_time_views)}</td>
                    <td className={`${td} text-right tabular-nums`}>{count(r.apply_clicks)}</td>
                    <td className={`${td} text-right tabular-nums`}>{percent(r.click_through_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="m-0 border-t border-line px-3 py-2 text-small text-muted">
              Click-through rate = apply clicks ÷ views, both for the same period. A click is not a submitted
              application.
            </p>
          </div>
          <ul
            className="m-0 list-none p-0 md:hidden"
            aria-label="Opportunities ranked by views"
            aria-busy={loading}
          >
            {data.data.map((r) => (
              <li key={r.id} className="border-t border-line px-4 py-3">
                <Link
                  href={`/workspace/opportunities/${r.id}`}
                  className="text-base text-accent [overflow-wrap:anywhere]"
                >
                  {r.title}
                </Link>
                <p className="m-0 text-small text-muted">
                  {r.organisation} · {formatDate(r.published_at)}
                </p>
                <dl className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ctl">
                  <dt className="text-muted">Views in period</dt>
                  <dd className="m-0 text-right tabular-nums">{count(r.views)}</dd>
                  <dt className="text-muted">All-time views</dt>
                  <dd className="m-0 text-right tabular-nums">{count(r.all_time_views)}</dd>
                  <dt className="text-muted">Apply clicks</dt>
                  <dd className="m-0 text-right tabular-nums">{count(r.apply_clicks)}</dd>
                  <dt className="text-muted">Click-through rate</dt>
                  <dd className="m-0 text-right tabular-nums">{percent(r.click_through_rate)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <p className="m-0 border-t border-line px-4 py-2 text-small text-muted md:hidden">
            Click-through rate = apply clicks ÷ views, both for the same period.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-ctl text-muted">
            <span role="status">
              {count(data.page.total)} {data.page.total === 1 ? "opportunity" : "opportunities"}
              {q ? ` matching “${q}”` : ""} · page {data.page.page} of {data.page.pages}
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= data.page.pages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </span>
          </div>
        </>
      ) : (
        <p className="m-0 border-t border-line px-4 py-5 text-ctl text-muted">
          {q ? `No opportunity matches “${q}”.` : "No published opportunities to show yet."}
        </p>
      )}
    </section>
  );
}
