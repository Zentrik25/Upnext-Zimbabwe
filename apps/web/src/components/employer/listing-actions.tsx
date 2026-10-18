"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { FormError } from "@/components/account/parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import type { EmployerListingDetail } from "@/lib/employer-types";

const LABEL = {
  discard: "Discard this version",
  reopen: "Reopen as a new draft",
  amend: "Start an amendment",
} as const;

/** Author actions other than editing and submitting (those live in the form). */
export function ListingActions({ listing }: { listing: EmployerListingDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const actions = listing.next_actions.filter(
    (a): a is keyof typeof LABEL => a === "discard" || a === "reopen" || a === "amend",
  );
  if (actions.length === 0) return null;

  async function act(action: keyof typeof LABEL) {
    if (action === "discard" && !window.confirm("Discard this version? This cannot be undone.")) return;
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch("POST", `employer/listings/${listing.id}/${action}`, {
      row_version: listing.row_version,
    });
    setBusy(false);
    if (!outcome.ok) return setFailure(describeFailure(outcome));
    router.push(action === "discard" ? "/employer" : `/employer/listings/${listing.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-2" data-testid="listing-actions">
      {failure ? <FormError>{failure}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action}
            variant="secondary"
            disabled={busy}
            onClick={() => act(action)}
            data-testid={`action-${action}`}
          >
            {LABEL[action]}
          </Button>
        ))}
      </div>
    </div>
  );
}
