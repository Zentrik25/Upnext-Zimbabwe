import Link from "next/link";
import { SaveToggle } from "@/components/account/save-toggle";
import { VerificationTag } from "@/components/opportunities/parts";
import { Icon, type IconName } from "@/components/ui/icons";
import type { OpportunitySummary, VerificationLevel } from "@/lib/catalog-types";
import { deadlineView, labelFor, locationLabel } from "@/lib/format";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
}

/** The organisation mark follows the verification level, as the label beside it does: lavender, green, purple. */
const MARK: Record<VerificationLevel, string> = {
  not_verified: "border-avatar-border bg-avatar-bg text-accent",
  source_checked: "border-good/30 bg-good-bg text-good",
  issuer_verified: "border-border-interest bg-match-bg text-secondary-text",
};

function Meta({ icon, children }: { icon: IconName; children: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icon} className="h-4 w-4 shrink-0" />
      {children}
    </li>
  );
}

/** One latest listing as its own card: accent edge, organisation mark, title, organisation, where, what kind, when it
 *  closes, and the verification label on its own line (D-14). The full detail is on the listing page. */
export function HomeListingRow({
  row,
  save,
}: {
  row: OpportunitySummary;
  save: { signedIn: boolean; saved: boolean; returnTo: string };
}) {
  const deadline = deadlineView(row.deadline, row.status);
  const where = locationLabel(row);
  const kind = labelFor(row.employment_type) ?? row.category.name;
  return (
    <article className="flex items-start gap-3 rounded-card border border-l-[3px] border-border-panel border-l-accent bg-surface p-3 shadow-subtle hover:bg-row-hover">
      <div
        aria-hidden="true"
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-card border text-base font-headline ${MARK[row.verification.level]}`}
      >
        {initials(row.organisation.name)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-headline text-base leading-title">
          <Link href={`/opportunities/${row.slug}`} className="hover:underline">
            {row.title}
          </Link>
        </h3>
        <p className="mt-0.5 text-ctl text-company">{row.organisation.name}</p>
        <ul className="m-0 mt-2 flex list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 text-ctl text-meta">
          {where ? <Meta icon="pin">{where}</Meta> : null}
          <Meta icon="briefcase">{kind}</Meta>
          <Meta icon="calendar">{deadline.label}</Meta>
        </ul>
        <div className="mt-2">
          <VerificationTag level={row.verification.level} />
        </div>
      </div>
      <SaveToggle
        opportunityId={row.id}
        title={row.title}
        initialSaved={save.saved}
        signedIn={save.signedIn}
        returnTo={save.returnTo}
      />
    </article>
  );
}
