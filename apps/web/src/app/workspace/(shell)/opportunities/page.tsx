import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, Select, TextInput } from "@/components/ui";
import { ListingTable } from "@/components/workspace/listing-table";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { ListingList } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Opportunities" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TABS: [string, string][] = [
  ["", "All"],
  ["draft", "Drafts"],
  ["in_review", "In review"],
  ["approved", "Approved"],
  ["published", "Published"],
  ["expired", "Expired"],
  ["rejected", "Rejected"],
];
const QUEUES: Record<string, string> = {
  review: "Awaiting my review",
  ready: "Approved, ready to publish",
  mine: "My drafts and rejected items",
  amendments: "Open amendments",
};
const KEYS = ["status", "queue", "deadline", "category", "verification", "q", "sort", "page"];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function OpportunitiesPage({ searchParams }: Props) {
  const session = await requireStaff("/workspace/opportunities");
  const raw = await searchParams;
  const q = new URLSearchParams();
  for (const key of KEYS) if (first(raw[key])) q.set(key, first(raw[key]));
  const result = await staffJson<ListingList>(`opportunities?${q.toString()}`);
  if (!result.ok) throw new Error("The list could not be loaded.");
  const { data, page, counts } = result.data;
  const status = first(raw.status);
  const queue = first(raw.queue);
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams(q);
    next.delete("page");
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    return `/workspace/opportunities${s ? `?${s}` : ""}`;
  };
  const pageHref = (n: number) => {
    const next = new URLSearchParams(q);
    next.set("page", String(n));
    return `/workspace/opportunities?${next.toString()}`;
  };
  const queueView = queue === "review" || queue === "ready";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-section font-light tracking-section">Opportunities</h1>
        {can(session, "opp.draft.create") ? (
          <Link
            href="/workspace/opportunities/new"
            className="inline-flex min-h-[40px] items-center rounded-control bg-accent-solid px-4 py-2 text-ctl text-on-accent hover:bg-accent-solid-hover"
          >
            Create opportunity
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="Filter opportunities by status"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map(([value, label]) => {
          const current = !queue && status === value;
          const n = value === "" ? counts.all : (counts[value] ?? 0);
          return (
            <Link
              key={value || "all"}
              href={href({ status: value, queue: "", deadline: "" })}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 text-ctl whitespace-nowrap ${current ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
              <span
                className={`rounded-control border px-[6px] text-small tabular-nums ${current ? "border-border-interest bg-match-bg text-accent" : "border-line bg-surface-pale text-muted"}`}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </nav>

      <form
        method="get"
        role="search"
        aria-label="Search and filter opportunities"
        className="mb-4 grid gap-3 rounded-card border border-line bg-surface-pale p-3 sm:grid-cols-2 min-[1100px]:grid-cols-[2fr_1fr_1fr_1fr_auto]"
      >
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {queue ? <input type="hidden" name="queue" value={queue} /> : null}
        <div>
          <label htmlFor="f-q" className="sr-only">
            Search by title, organisation, reference or web address
          </label>
          <TextInput
            id="f-q"
            name="q"
            type="search"
            placeholder="Search by title, organisation or reference"
            defaultValue={first(raw.q)}
            maxLength={80}
          />
        </div>
        <div>
          <label htmlFor="f-deadline" className="sr-only">
            Deadline
          </label>
          <Select id="f-deadline" name="deadline" defaultValue={first(raw.deadline)}>
            <option value="">Any deadline</option>
            <option value="soon">Within 7 days</option>
            <option value="past">Passed</option>
            <option value="unknown">Not stated</option>
          </Select>
        </div>
        <div>
          <label htmlFor="f-verification" className="sr-only">
            Verification
          </label>
          <Select id="f-verification" name="verification" defaultValue={first(raw.verification)}>
            <option value="">Any verification</option>
            <option value="not_verified">Not verified</option>
            <option value="source_checked">Source checked</option>
            <option value="issuer_verified">Verified with the issuer</option>
          </Select>
        </div>
        <div>
          <label htmlFor="f-sort" className="sr-only">
            Sort by
          </label>
          <Select id="f-sort" name="sort" defaultValue={first(raw.sort)}>
            <option value="">Newest changes first</option>
            <option value="oldest">Oldest changes first</option>
            <option value="title">Title</option>
            <option value="closing">Closing date</option>
          </Select>
        </div>
        <Button type="submit">Apply</Button>
      </form>

      {queue && QUEUES[queue] ? (
        <p className="m-0 mb-3 flex flex-wrap items-center gap-2 text-ctl text-muted">
          Queue: <strong className="font-normal text-ink">{QUEUES[queue]}</strong>
          <Link href={href({ queue: "" })} className="text-accent underline">
            Show all listings
          </Link>
        </p>
      ) : null}

      <section
        aria-label="Results"
        className="rounded-card border border-border-panel bg-surface shadow-subtle"
      >
        {data.length ? (
          <ListingTable
            rows={data}
            kind={queueView ? "queue" : "default"}
            caption="Opportunities matching the filters"
          />
        ) : (
          <div className="p-4">
            <EmptyState as="h2" title="No opportunities match">
              Change or clear the filters. Listings by other people stay private until they are submitted.
            </EmptyState>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-ctl text-muted">
          <span>
            {page.total} {page.total === 1 ? "opportunity" : "opportunities"}
          </span>
          {page.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center gap-3">
              {page.page > 1 ? (
                <Link href={pageHref(page.page - 1)} rel="prev" className="text-accent underline">
                  Previous
                </Link>
              ) : null}
              <span aria-current="page">
                Page {page.page} of {page.pages}
              </span>
              {page.page < page.pages ? (
                <Link href={pageHref(page.page + 1)} rel="next" className="text-accent underline">
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </section>
    </>
  );
}
