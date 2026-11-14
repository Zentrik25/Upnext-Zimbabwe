import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, Select, TextInput } from "@/components/ui";
import { StatusBadge, dateText } from "@/components/workspace/badges";
import { STATUS_LABEL, type InsightsMeta, type StaffArticleRow } from "@/lib/insights-types";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { StatusTone } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Career Insights" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type List = { data: StaffArticleRow[]; page: { page: number; pages: number; total: number } };

const KEYS = ["q", "status", "category", "author", "sort", "page"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TONE: Record<string, StatusTone> = {
  draft: "neutral",
  submitted: "info",
  in_review: "info",
  approved: "warning",
  published: "success",
  archived: "muted",
};

/** Career Insights articles in the workspace (D-78): filters, sorting and pages are plain links and a GET form. */
export default async function InsightsListPage({ searchParams }: Props) {
  const session = await requireStaff("/workspace/insights");
  const writer = can(session, "insights.write");
  if (!writer && !can(session, "insights.review") && !can(session, "insights.publish")) notFound();
  const raw = await searchParams;
  const q = new URLSearchParams();
  for (const key of KEYS) if (first(raw[key])) q.set(key, first(raw[key]));
  const [list, meta] = await Promise.all([
    staffJson<List>(`insights/articles?${q.toString()}`),
    staffJson<InsightsMeta>("insights/meta"),
  ]);
  if (!list.ok || !meta.ok) throw new Error("The articles could not be loaded.");
  const { data, page } = list.data;
  const pageHref = (n: number) => {
    const next = new URLSearchParams(q);
    next.set("page", String(n));
    return `/workspace/insights?${next.toString()}`;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 mb-1 text-title font-light tracking-title">Career Insights</h1>
          <p className="m-0 max-w-[60ch] text-base text-muted">
            Articles are reviewed by a second editor before they are published. Nothing is published
            automatically.
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          {can(session, "insights.manage") ? (
            <Link
              href="/workspace/insights/categories"
              className="inline-flex min-h-[40px] items-center text-ctl text-accent underline"
            >
              Categories
            </Link>
          ) : null}
          <Link
            href="/workspace/insights/authors"
            className="inline-flex min-h-[40px] items-center text-ctl text-accent underline"
          >
            Author profiles
          </Link>
          {writer ? (
            <Link
              href="/workspace/insights/new"
              className="inline-flex min-h-[40px] items-center rounded-control bg-accent-solid px-4 text-ctl font-medium text-white"
            >
              New article
            </Link>
          ) : null}
        </span>
      </div>

      <form
        method="get"
        action="/workspace/insights"
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        aria-label="Filter articles"
      >
        <label htmlFor="f-q" className="grid gap-1 text-small font-strong">
          Search headlines
          <TextInput id="f-q" name="q" defaultValue={first(raw.q)} />
        </label>
        <label htmlFor="f-status" className="grid gap-1 text-small font-strong">
          Status
          <Select id="f-status" name="status" defaultValue={first(raw.status)}>
            <option value="">Any status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label htmlFor="f-category" className="grid gap-1 text-small font-strong">
          Category
          <Select id="f-category" name="category" defaultValue={first(raw.category)}>
            <option value="">Any category</option>
            {meta.data.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        {meta.data.writers.length ? (
          <label htmlFor="f-author" className="grid gap-1 text-small font-strong">
            Author
            <Select id="f-author" name="author" defaultValue={first(raw.author)}>
              <option value="">Any author</option>
              {meta.data.writers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label htmlFor="f-sort" className="grid gap-1 text-small font-strong">
          Sort by
          <Select id="f-sort" name="sort" defaultValue={first(raw.sort) || "updated"}>
            <option value="updated">Last modified</option>
            <option value="created">Created</option>
            <option value="published">Published</option>
          </Select>
        </label>
        <Button type="submit" className="self-end">
          Apply
        </Button>
      </form>

      {data.length === 0 ? (
        <EmptyState as="h2" title="No articles match">
          {writer ? "Start a new article, or clear the filters." : "Clear the filters to see every article."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[760px] border-collapse text-left text-ctl">
            <caption className="sr-only">Career Insights articles, {page.total} in all</caption>
            <thead className="bg-surface-pale text-small text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Headline
                </th>
                <th scope="col" className="px-3 py-2">
                  Category
                </th>
                <th scope="col" className="px-3 py-2">
                  Author
                </th>
                <th scope="col" className="px-3 py-2">
                  Status
                </th>
                <th scope="col" className="px-3 py-2">
                  Created
                </th>
                <th scope="col" className="px-3 py-2">
                  Updated
                </th>
                <th scope="col" className="px-3 py-2">
                  Published
                </th>
                <th scope="col" className="px-3 py-2">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-2 font-strong">
                    <Link href={`/workspace/insights/${a.id}/edit`} className="text-ink hover:underline">
                      {a.headline}
                    </Link>
                    {a.live && a.live_slug ? (
                      <Link
                        href={`/insights/${a.live_slug}`}
                        className="block text-small font-normal text-accent underline"
                      >
                        View on the site
                      </Link>
                    ) : null}
                  </th>
                  <td className="px-3 py-2">{a.category?.name ?? "—"}</td>
                  <td className="px-3 py-2">{a.author?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={TONE[a.status] ?? "neutral"}>{STATUS_LABEL[a.status]}</StatusBadge>
                  </td>
                  <td className="px-3 py-2">{dateText(a.created_at)}</td>
                  <td className="px-3 py-2">{dateText(a.updated_at)}</td>
                  <td className="px-3 py-2">{a.published_at ? dateText(a.published_at) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-x-3">
                      <Link
                        href={`/workspace/insights/${a.id}/edit`}
                        className="inline-flex min-h-[24px] items-center text-accent underline"
                      >
                        {a.actions.includes("save")
                          ? "Edit"
                          : a.actions.includes("approve")
                            ? "Review"
                            : "Open"}
                      </Link>
                      <Link
                        href={`/workspace/insights/${a.id}/preview`}
                        className="inline-flex min-h-[24px] items-center text-accent underline"
                      >
                        Preview
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page.pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-3 text-ctl">
          {page.page > 1 ? (
            <Link rel="prev" href={pageHref(page.page - 1)} className="text-accent underline">
              Previous
            </Link>
          ) : null}
          <span>
            Page {page.page} of {page.pages}
          </span>
          {page.page < page.pages ? (
            <Link rel="next" href={pageHref(page.page + 1)} className="text-accent underline">
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
