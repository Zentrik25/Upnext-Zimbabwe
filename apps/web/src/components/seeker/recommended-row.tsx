import { OpportunityRow } from "@/components/opportunities/parts";
import type { ForYouRow } from "@/lib/seeker-types";

/** A listing plus the plain-language reasons it was chosen, what the listing does not say, and any note. */
export function RecommendedRow({ row, returnTo }: { row: ForYouRow; returnTo: string }) {
  const { reasons, unknowns, notes } = row.match;
  const extra =
    reasons.length + unknowns.length + notes.length === 0 ? undefined : (
      <div className="mt-3 border-t border-line pt-2 text-small text-muted" data-testid="why">
        {reasons.length > 0 ? (
          <>
            <p className="font-strong text-ink">Why you are seeing this</p>
            <ul className="m-0 mt-1 list-disc pl-5">
              {reasons.map((reason) => (
                <li key={reason.signal}>{reason.text}</li>
              ))}
            </ul>
          </>
        ) : null}
        {notes.length + unknowns.length > 0 ? (
          <ul className="m-0 mt-1 list-disc pl-5">
            {[...notes, ...unknowns].map((note) => (
              <li key={`${note.signal}:${note.text}`}>{note.text}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  return (
    <OpportunityRow
      row={row.opportunity}
      save={{ signedIn: true, saved: row.opportunity.is_saved === true, returnTo }}
      extra={extra}
    />
  );
}
