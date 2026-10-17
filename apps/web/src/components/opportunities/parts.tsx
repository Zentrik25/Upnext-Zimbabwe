import type { OpportunitySummary, VerificationLevel } from "@/lib/catalog-types";
import { deadlineView, labelFor, formatMoney, locationLabel, VERIFICATION } from "@/lib/format";
import { ListingRow, Tag } from "@/components/ui";

export function VerificationTag({ level }: { level: VerificationLevel }) {
  return <Tag tone={level === "not_verified" ? "default" : "good"}>{VERIFICATION[level].label}</Tag>;
}

/** One search result: plain facts are unboxed text, deadline and verification are labelled chips. */
export function OpportunityRow({ row }: { row: OpportunitySummary }) {
  const deadline = deadlineView(row.deadline, row.status);
  const facts = [
    row.category.name,
    locationLabel(row),
    labelFor(row.employment_type),
    labelFor(row.work_mode),
    formatMoney(row.salary),
  ].filter((fact): fact is string => Boolean(fact));
  return (
    <ListingRow
      organisation={row.organisation.name}
      title={row.title}
      href={`/opportunities/${row.slug}`}
      facts={facts}
      tags={[
        { label: deadline.label, tone: deadline.tone },
        {
          label: VERIFICATION[row.verification.level].label,
          tone: row.verification.level === "not_verified" ? "default" : "good",
        },
      ]}
      sourceNote={row.primary_source_name ? `Source: ${row.primary_source_name}` : "Source not named"}
    />
  );
}
