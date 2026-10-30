import Link from "next/link";
import { SaveToggle } from "@/components/account/save-toggle";
import { Tag } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { OpportunitySummary } from "@/lib/catalog-types";
import { deadlineView, labelFor, locationLabel, VERIFICATION, verificationTone } from "@/lib/format";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
}

function Meta({ icon, children }: { icon: IconName; children: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icon} className="h-4 w-4 shrink-0" />
      {children}
    </li>
  );
}

/** Compact listing row for the home page: organisation mark, title, where, what kind, when it closes. The
 *  verification label stays on every row (D-14); the full source is on the listing page. */
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
    <article className="flex items-start gap-3 border-b border-line px-4 py-4 last:border-b-0 hover:bg-row-hover max-sm:px-3">
      <div
        aria-hidden="true"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-card border border-avatar-border bg-avatar-bg font-bold text-avatar-text"
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
        <ul className="m-0 mt-2 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-small text-meta">
          {where ? <Meta icon="pin">{where}</Meta> : null}
          <Meta icon="briefcase">{kind}</Meta>
          <Meta icon="calendar">{deadline.label}</Meta>
          <li>
            <Tag tone={verificationTone(row.verification.level)}>
              {VERIFICATION[row.verification.level].label}
            </Tag>
          </li>
        </ul>
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
