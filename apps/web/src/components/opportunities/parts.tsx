import type { ReactNode } from "react";
import type { OpportunitySummary, VerificationLevel } from "@/lib/catalog-types";
import {
  deadlineView,
  labelFor,
  formatMoney,
  locationLabel,
  VERIFICATION,
  verificationTone,
} from "@/lib/format";
import { SaveToggle } from "@/components/account/save-toggle";
import { ListingRow, Tag } from "@/components/ui";
import { Icon } from "@/components/ui/icons";

/** The verification label; a checked listing carries a small tick so the state reads at a glance. */
export function VerificationTag({ level }: { level: VerificationLevel }) {
  return (
    <Tag tone={verificationTone(level)} className="inline-flex items-center gap-1 text-small">
      {level === "not_verified" ? null : <Icon name="checkCircle" className="h-3.5 w-3.5 shrink-0" />}
      {VERIFICATION[level].label}
    </Tag>
  );
}

/** One search result: plain facts are unboxed text, deadline and verification are labelled chips. */
export function OpportunityRow({
  row,
  save,
  refreshOnChange = false,
  extra,
}: {
  row: OpportunitySummary;
  /** Present on pages that know the session: the live save toggle. */
  save?: { signedIn: boolean; saved: boolean; returnTo: string };
  refreshOnChange?: boolean;
  extra?: ReactNode;
}) {
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
          tone: verificationTone(row.verification.level),
        },
      ]}
      extra={extra}
      image={row.image?.featured ?? null}
      sourceNote={row.primary_source_name ? `Source: ${row.primary_source_name}` : "Source not named"}
      action={
        save ? (
          <SaveToggle
            opportunityId={row.id}
            title={row.title}
            initialSaved={save.saved}
            signedIn={save.signedIn}
            returnTo={save.returnTo}
            refreshOnChange={refreshOnChange}
          />
        ) : undefined
      }
    />
  );
}
