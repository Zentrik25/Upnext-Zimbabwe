"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { FormError } from "@/components/account/parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import type { EmployerListingDetail } from "@/lib/employer-types";

const LABEL = {
  discard: "Discard this version",
  reopen: "Reopen as a new draft",
  amend: "Start an amendment",
  close: "Close this listing",
} as const;

/** Author actions other than editing and submitting (those live in the form). */
export function ListingActions({ listing }: { listing: EmployerListingDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const actions = listing.next_actions.filter(
    (a): a is keyof typeof LABEL => a === "discard" || a === "reopen" || a === "amend" || a === "close",
  );
  if (actions.length === 0) return null;

  async function act(action: keyof typeof LABEL) {
    if (action === "discard" && !window.confirm("Discard this version? This cannot be undone.")) return;
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch("POST", `employer/listings/${listing.id}/${action}`, {
      row_version: listing.row_version,
      ...(action === "close" ? { reason: reason.trim() } : {}),
    });
    setBusy(false);
    if (!outcome.ok) {
      return setFailure(
        outcome.code === "validation_failed" && outcome.fields.reason
          ? "Say why you are closing it, in 10 to 1,000 characters."
          : describeFailure(outcome),
      );
    }
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
            onClick={() => (action === "close" ? setClosing(true) : act(action))}
            data-testid={`action-${action}`}
          >
            {LABEL[action]}
          </Button>
        ))}
      </div>
      {closing ? (
        <div className="grid max-w-[480px] gap-2" data-testid="close-form">
          <p className="text-small text-muted">
            The listing comes off the site and stays readable, marked as withdrawn by the issuer. To publish
            it again you would start an amendment and have it reviewed.
          </p>
          <Field id="close_reason" label="Why are you closing it?" hint="10 to 1,000 characters.">
            <Textarea
              id="close_reason"
              rows={2}
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act("close")} data-testid="confirm-close">
              Yes, close this listing
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setClosing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
