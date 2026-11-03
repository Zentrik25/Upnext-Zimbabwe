import type { ReactNode } from "react";
import { count } from "@/lib/staff-format";

/** One compact figure: a small label above a number. Used for the traffic cards and a listing's own statistics. */
export function Metric({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number | string | null;
  note?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-small text-muted">{label}</span>
      <span className="text-[24px] leading-[1.15] font-light tracking-title tabular-nums text-ink">
        {typeof value === "number" || value === null ? count(value) : value}
      </span>
      {note ? <span className="text-small text-muted">{note}</span> : null}
    </>
  );
  const box = "flex min-w-0 flex-col gap-0.5 rounded-card border border-line bg-surface px-3 py-2.5";
  return href ? (
    <a href={href} className={`${box} hover:border-border-interest`}>
      {body}
    </a>
  ) : (
    <div className={box}>{body}</div>
  );
}
