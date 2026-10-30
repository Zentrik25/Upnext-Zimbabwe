import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/workspace/icons";
import { ListingTable } from "@/components/workspace/listing-table";
import { ago } from "@/components/workspace/badges";
import { EmptyState } from "@/components/ui";
import { can, currentTime, requireStaff, staffJson } from "@/lib/staff";
import type { Dashboard } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Dashboard" };

const panel = "min-w-0 rounded-card border border-border-panel bg-surface shadow-subtle";
const heading = "m-0 text-title font-normal tracking-title";
const more = "inline-flex items-center gap-[6px] text-ctl text-accent whitespace-nowrap";

export default async function DashboardPage() {
  const session = await requireStaff("/workspace");
  const result = await staffJson<Dashboard>("dashboard");
  if (!result.ok) throw new Error("The dashboard could not be loaded.");
  const { kpis, attention, activity, listings } = result.data;
  const now = currentTime();
  const first = session.user.name.split(" ")[0] ?? session.user.name;
  const canCreate = can(session, "opp.draft.create");

  return (
    <>
      <section
        aria-labelledby="welcome"
        className="mb-5 grid min-h-[180px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-feature border border-border-interest bg-match-bg pt-6 pr-5 pl-6 sm:min-h-[200px] sm:pt-7 sm:pr-8 sm:pl-9"
      >
        <div className="pb-6">
          <h1
            id="welcome"
            className="m-0 mb-2 text-[clamp(26px,6vw,40px)] font-light leading-[1.1] tracking-display"
          >
            Welcome back, {first}
          </h1>
          <p className="m-0 mb-[18px] max-w-[46ch] text-base font-light text-muted">
            Manage opportunities, review submissions and keep the platform up to date.
          </p>
          {canCreate ? (
            <Link
              href="/workspace/opportunities/new"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-control bg-accent-solid px-4 py-2 text-ctl text-on-accent hover:bg-accent-solid-hover"
            >
              <Icon name="plus-sm" />
              Create opportunity
            </Link>
          ) : null}
        </div>
        <Image
          src="/brand/staff-welcome.webp"
          alt=""
          width={560}
          height={410}
          priority
          className="-mb-px block h-auto w-[clamp(104px,30vw,270px)] self-end"
        />
      </section>

      <section aria-labelledby="kpi-title" className="@container">
        <h2 id="kpi-title" className="sr-only">
          Opportunity totals
        </h2>
        <ul className="m-0 mb-5 grid list-none grid-cols-2 gap-[10px] p-0 @min-[560px]:grid-cols-3 @min-[940px]:grid-cols-5 [&>li:last-child:nth-child(odd)]:col-span-2 @min-[560px]:[&>li:last-child:nth-child(odd)]:col-span-1">
          {kpis.map((k) => (
            <li key={k.key}>
              <Link
                href={k.href}
                className="flex h-full items-center gap-3 rounded-card border border-line bg-surface p-[14px] text-ink shadow-subtle hover:border-border-interest hover:shadow-ambient"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-card bg-match-bg text-accent"
                >
                  <Icon name={k.icon} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-ctl">{k.label}</span>
                  <span className="text-[30px] leading-[1.15] font-light tracking-title tabular-nums">
                    {k.value}
                  </span>
                  <span className="text-small text-muted">{k.note}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="@container mb-4">
        <div className="grid gap-4 @min-[820px]:grid-cols-[5fr_7fr]">
          <section aria-labelledby="attention-title" className={panel}>
            <div className="flex items-center justify-between gap-3 px-4 pt-[14px] pb-[10px]">
              <h2 id="attention-title" className={heading}>
                Needs attention
              </h2>
            </div>
            <ul className="m-0 list-none p-0">
              {attention.map((row) => (
                <li key={row.key} className="border-t border-line">
                  <Link
                    href={row.href}
                    className="flex min-h-[48px] items-center gap-3 px-4 py-2 text-ink hover:bg-row-hover"
                  >
                    <Icon name={row.icon} className="h-[18px] w-[18px] text-muted" />
                    <span className="min-w-0 flex-1">{row.label}</span>
                    <span
                      className={`min-w-[28px] rounded-control border px-2 py-px text-center text-ctl tabular-nums ${row.count ? "border-border-interest bg-match-bg text-accent" : "border-line bg-surface-pale text-muted"}`}
                    >
                      {row.count}
                    </span>
                    <Icon name="chevron-right" className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="activity-title" className={panel}>
            <div className="flex items-center justify-between gap-3 px-4 pt-[14px] pb-[10px]">
              <h2 id="activity-title" className={heading}>
                Recent activity
              </h2>
              <Link href="/workspace/activity" className={more}>
                View all <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>
            {activity.length ? (
              <ul className="m-0 list-none p-0">
                {activity.map((a, i) => (
                  <li key={`${a.href}-${i}`} className="border-t border-line">
                    <Link
                      href={a.href}
                      className="flex min-h-[48px] items-center gap-3 px-4 py-2 text-ink hover:bg-row-hover"
                    >
                      <Icon name="file" className="h-[18px] w-[18px] flex-none text-muted" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="[overflow-wrap:anywhere]">
                          <strong className="font-normal">{a.subject}</strong>{" "}
                          <span className="text-ctl text-muted">{a.verb.toLowerCase()}</span>
                        </span>
                        <span className="text-small text-muted">by {a.actor}</span>
                      </span>
                      <time
                        dateTime={a.when}
                        title={a.when}
                        className="text-ctl whitespace-nowrap text-muted"
                      >
                        {ago(a.when, now)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 border-t border-line px-4 py-5 text-muted">
                No activity yet. Listing changes appear here as they happen.
              </p>
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="latest-title" className={panel}>
        <div className="flex items-center justify-between gap-3 px-4 pt-[14px] pb-[10px]">
          <h2 id="latest-title" className={heading}>
            Latest opportunities
          </h2>
          <Link href="/workspace/opportunities" className={more}>
            View all <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
        {listings.length ? (
          <ListingTable rows={listings} caption="The most recently changed opportunities you can see" />
        ) : (
          <div className="p-4">
            <EmptyState as="h3" title="No opportunities yet">
              {canCreate
                ? "Create the first one from the button above."
                : "Listings you can see appear here."}
            </EmptyState>
          </div>
        )}
      </section>
    </>
  );
}
