"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client-api";
import type { ClaimRow } from "@/lib/staff-types";
import { Notice } from "./primitives";

const METHODS = [
  ["document_review", "Document review"],
  ["official_email_domain", "Official e-mail domain"],
  ["website_control", "Website control"],
  ["phone_callback", "Phone call-back"],
  ["other", "Other"],
] as const;

/** Approve or reject an organisation claim. Approval records how ownership was verified; nobody decides their own. */
export function ClaimDecision({ claim }: { claim: ClaimRow }) {
  const router = useRouter();
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true);
    setError(null);
    const body =
      mode === "approve"
        ? {
            approve: true,
            reason: text("reason") || null,
            ...(claim.already_verified
              ? {}
              : { method: text("method"), evidence_note: text("evidence_note") }),
          }
        : { approve: false, reason: text("reason") };
    const result = await apiFetch("POST", `staff/claims/${claim.id}/decision`, body);
    setBusy(false);
    if (!result.ok) {
      setError(`${result.message} ${Object.values(result.fields).flat().join(" ")}`.trim());
      return;
    }
    setMode(null);
    router.refresh();
  }

  if (!mode) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setMode("approve")}>Approve claim</Button>
        <Button variant="danger" onClick={() => setMode("reject")}>
          Reject claim
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-card border border-line p-4" noValidate>
      <h4 className="text-ctl font-medium">
        {mode === "approve" ? "Approve this claim" : "Reject this claim"}
      </h4>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {mode === "approve" && !claim.already_verified ? (
        <>
          <Field id={`m-${claim.id}`} label="How was ownership verified?">
            <Select id={`m-${claim.id}`} name="method" defaultValue="document_review">
              {METHODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={`e-${claim.id}`}
            label="Evidence note"
            hint="10 to 2000 characters. Kept with the verification record."
          >
            <Textarea id={`e-${claim.id}`} name="evidence_note" rows={3} />
          </Field>
        </>
      ) : null}
      <Field
        id={`r-${claim.id}`}
        label={mode === "reject" ? "Reason (shown to the claimant)" : "Note (optional)"}
      >
        <Textarea id={`r-${claim.id}`} name="reason" rows={2} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant={mode === "reject" ? "danger" : "primary"} disabled={busy}>
          {busy ? "Saving…" : mode === "approve" ? "Approve" : "Reject"}
        </Button>
        <Button variant="secondary" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
