"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Select, Textarea } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { ListingRow } from "@/lib/staff-types";
import { StatusBadge } from "./badges";

/** The methods of the verification standard (D-75, docs/editorial/VERIFICATION_STANDARD.md), as staff choose them. */
export const VERIFY_METHODS = [
  ["source_page_review", "Found on the employer's own website or official channel"],
  ["document_review", "Checked the employer's original notice"],
  ["issuer_contact", "Confirmed directly with the employer"],
  ["employer_account", "Posted through a verified employer account"],
] as const;

/**
 * Verified / Not verified (D-62) under the verification standard (D-75). Unverify is one action. Verify (and Re-verify,
 * for a listing marked Verified before the standard) opens a short form: how the listing was checked and what was seen,
 * which the server requires together with a recorded source and a checker who did not write the listing. The label
 * changes only after the server has answered, so it always shows what was saved. The button appears for people whose
 * account holds the permission; the server decides again on every request, so showing it is never the protection.
 */
export function VerifyToggle({
  id,
  verified,
  canVerify,
  reverify = false,
  compact = false,
  className,
}: {
  id: string;
  verified: boolean;
  canVerify: boolean;
  /** Verified before the standard: waits for an editor to check it again (D-75). */
  reverify?: boolean;
  /** A small text button for table rows. */
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [state, setState] = useState({ verified, reverify });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [evidence, setEvidence] = useState("");

  // A new value from the page (after a refresh or an autosave) is the truth again.
  const [seen, setSeen] = useState({ verified, reverify });
  if (seen.verified !== verified || seen.reverify !== reverify) {
    setSeen({ verified, reverify });
    setState({ verified, reverify });
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setProblem(null);
    setFields({});
    const result = await apiFetch<ListingRow>("PUT", `staff/opportunities/${id}/verification`, body);
    setBusy(false);
    if (!result.ok) {
      setFields(result.fields ?? {});
      return setProblem(describeFailure(result));
    }
    setState({ verified: result.data.verified, reverify: Boolean(result.data.reverification_required) });
    setOpen(false);
    setMethod("");
    setEvidence("");
    router.refresh();
  }

  const needsCheck = !state.verified || state.reverify;
  const small = compact ? "min-h-0 px-2 py-[2px] text-small" : undefined;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <StatusBadge tone={state.verified ? "success" : "neutral"}>
        {state.verified ? "Verified" : "Not verified"}
      </StatusBadge>
      {state.verified && state.reverify ? <StatusBadge tone="warning">Re-verify</StatusBadge> : null}
      {canVerify && needsCheck && !open ? (
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={busy} className={small}>
          {state.verified ? "Re-verify" : "Verify"}
        </Button>
      ) : null}
      {canVerify && state.verified ? (
        <Button
          variant="secondary"
          onClick={() => void send({ verified: false })}
          disabled={busy}
          aria-busy={busy}
          className={small}
        >
          {busy && !open ? "Saving…" : "Unverify"}
        </Button>
      ) : null}
      {open ? (
        <form
          className="mt-1 grid w-full min-w-[260px] gap-2 rounded-card border border-line p-3"
          aria-label="Verify this listing"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ verified: true, method, evidence });
          }}
        >
          <label htmlFor={`${ids}-method`} className="text-small font-strong">
            How was it checked?
          </label>
          <Select
            id={`${ids}-method`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            aria-invalid={Boolean(fields.method)}
          >
            <option value="">Choose a method</option>
            {VERIFY_METHODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {fields.method ? <span className="text-small text-danger">{fields.method.join(" ")}</span> : null}
          <label htmlFor={`${ids}-evidence`} className="text-small font-strong">
            Evidence: what you checked, where and with whom
          </label>
          <Textarea
            id={`${ids}-evidence`}
            value={evidence}
            maxLength={2000}
            rows={3}
            onChange={(e) => setEvidence(e.target.value)}
            aria-invalid={Boolean(fields.evidence)}
          />
          {fields.evidence ? (
            <span className="text-small text-danger">{fields.evidence.join(" ")}</span>
          ) : null}
          {fields.sources ? <span className="text-small text-danger">{fields.sources.join(" ")}</span> : null}
          <span className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} aria-busy={busy} className={small}>
              {busy ? "Saving…" : "Mark verified"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)} className={small}>
              Cancel
            </Button>
          </span>
        </form>
      ) : null}
      {problem ? (
        <span role="alert" className="text-small text-danger">
          <span className="font-strong">Error:</span> {problem}
        </span>
      ) : null}
    </span>
  );
}
