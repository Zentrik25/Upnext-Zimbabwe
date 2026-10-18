import { SaveToggle } from "@/components/account/save-toggle";
import { Tag } from "@/components/ui";
import type { SavedItem } from "@/lib/session";
import { OpportunityRow } from "./parts";

/** One saved listing. Closed or withdrawn listings keep their content; unavailable ones show a notice only. */
export function SavedRow({ item }: { item: SavedItem }) {
  if (item.opportunity === null) {
    return (
      <article className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[15px]">
        <div>
          <p className="text-title font-strong leading-title">This listing is no longer available</p>
          <p className="mt-1 text-small text-muted">
            It was removed from NextJob, so its details are not shown. You can remove it from your list.
          </p>
          <p className="mt-2">
            <Tag>Unavailable</Tag>
          </p>
        </div>
        <SaveToggle
          opportunityId={item.opportunity_id}
          title="this unavailable listing"
          initialSaved
          signedIn
          returnTo="/saved"
          refreshOnChange
        />
      </article>
    );
  }
  const open = item.availability === "open";
  const extra = (
    <p className="mt-3 text-small" data-testid="saved-availability">
      {open ? (
        <a href={`/opportunities/${item.opportunity.slug}#apply`} className="text-accent underline">
          How to apply on the official site
        </a>
      ) : (
        <span className="text-muted">
          {item.availability === "withdrawn"
            ? "The issuer withdrew this listing, so there is nothing to apply to."
            : "This listing has closed. It stays here so you can see what happened."}
        </span>
      )}
    </p>
  );
  return (
    <OpportunityRow
      row={item.opportunity}
      save={{ signedIn: true, saved: true, returnTo: "/saved" }}
      refreshOnChange
      extra={extra}
    />
  );
}
