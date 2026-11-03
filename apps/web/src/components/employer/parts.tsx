import type { ReactNode } from "react";
import { Tag } from "@/components/ui";
import type { ClaimStatus, ListingStatusValue } from "@/lib/employer-types";
import { CLAIM_LABEL, STATUS_LABEL } from "@/lib/employer-types";

export function StatusTag({ status }: { status: ListingStatusValue }) {
  const tone = status === "published" ? "good" : status === "rejected" ? "urgent" : "default";
  return <Tag tone={tone}>{STATUS_LABEL[status]}</Tag>;
}

export function ClaimTag({ status }: { status: ClaimStatus }) {
  return (
    <Tag tone={status === "approved" ? "good" : status === "rejected" ? "urgent" : "default"}>
      {CLAIM_LABEL[status]}
    </Tag>
  );
}

export function EmployerHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-section font-strong tracking-section">{title}</h1>
      {children}
    </div>
  );
}

/** Aggregate counters are approximate and carry no visitor data; say so wherever they appear. */
export const ANALYTICS_NOTE =
  "Counts are approximate: repeat visits and automated visits are included, and no visitor is identified.";
