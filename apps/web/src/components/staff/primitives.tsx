import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { Tag, type TagTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Page } from "@/lib/staff-types";
import { STATUS_LABEL } from "@/lib/staff-format";

/** Page title block: a weight-300 headline with the system's section tracking, optional lead text and actions. */
export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-sub tracking-sub text-ink max-sm:text-title">{title}</h1>
        {lead ? <p className="mt-1 max-w-[62ch] text-ctl text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-border-panel bg-(--staff-card) p-5 shadow-subtle max-sm:p-4",
        className,
      )}
      {...props}
    />
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 text-lead tracking-title text-ink">
      {children}
    </h2>
  );
}

export function StatCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number | null;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <span className="text-small text-muted">{label}</span>
      <span className="tnum mt-1 block text-section tracking-section text-ink">{value ?? "-"}</span>
      {hint ? <span className="mt-1 block text-small text-muted">{hint}</span> : null}
    </>
  );
  const shell = "block rounded-card border border-border-panel bg-(--staff-card) p-4 shadow-subtle";
  return href ? (
    <Link href={href} className={cn(shell, "hover:border-border-strong")}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

const STATUS_TONE: Record<string, TagTone> = {
  draft: "default",
  in_review: "urgent",
  approved: "accent",
  rejected: "danger",
  published: "good",
  expired: "default",
  withdrawn: "default",
  archived: "default",
};

/** Status chip: the label always carries the meaning; the tone only reinforces it. */
export function StatusBadge({ status }: { status: string }) {
  return <Tag tone={STATUS_TONE[status] ?? "default"}>{STATUS_LABEL[status] ?? status}</Tag>;
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-border-interest bg-match-bg text-ink",
    error: "border-danger/40 bg-danger-bg text-danger",
    success: "border-good/40 bg-good-bg text-good",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-card border px-4 py-3 text-ctl", tones[tone], className)}
    >
      {tone === "error" ? <span className="font-strong">Error: </span> : null}
      {children}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border-empty px-4 py-10 text-center text-ctl text-empty-text">
      {children}
    </div>
  );
}

/** Previous / next with the current range; links keep every other query parameter. */
export function Pagination({
  page,
  hrefFor,
  noun = "results",
}: {
  page: Page;
  hrefFor: (page: number) => string;
  noun?: string;
}) {
  const from = page.total === 0 ? 0 : (page.number - 1) * page.size + 1;
  const to = Math.min(page.total, page.number * page.size);
  const link =
    "inline-flex min-h-control items-center rounded-control border border-border-strong px-3 text-ctl text-secondary-text hover:bg-accent/5";
  const off =
    "inline-flex min-h-control items-center rounded-control border border-line px-3 text-ctl text-muted opacity-60";
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="tnum text-small text-muted" role="status">
        {from}-{to} of {page.total} {noun}
      </p>
      <div className="flex items-center gap-2">
        {page.number > 1 ? (
          <Link href={hrefFor(page.number - 1)} className={link} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Previous
          </span>
        )}
        <span className="tnum text-small text-muted">
          Page {page.number} of {page.pages}
        </span>
        {page.number < page.pages ? (
          <Link href={hrefFor(page.number + 1)} className={link} rel="next">
            Next
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

/** Small key/value list used by detail cards. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-ctl max-sm:grid-cols-1 max-sm:gap-y-0.5">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted max-sm:mt-2">{item.label}</dt>
          <dd className="min-w-0 break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
