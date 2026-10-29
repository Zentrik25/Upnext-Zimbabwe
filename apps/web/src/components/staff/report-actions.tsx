"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client-api";
import type { ReportDetail } from "@/lib/staff-types";
import { Notice } from "./primitives";

const RESOLUTIONS = [
  ["listing_corrected", "Listing corrected"],
  ["no_action_needed", "Checked; no action needed"],
] as const;
const DISMISSALS = [
  ["not_substantiated", "Not substantiated"],
  ["already_handled", "Already handled"],
  ["out_of_scope", "Out of scope"],
  ["spam", "Spam or abuse"],
] as const;
const LISTING_ACTIONS = [
  ["expire", "Mark the listing expired"],
  ["withdraw", "Withdraw the listing"],
  ["takedown", "Take the listing down"],
] as const;

type Mode = "note" | "resolve" | "dismiss" | "listing" | "escalate" | "reopen";

/** The moderation steps for one report. The service checks permission, separation of duties and concurrency. */
export function ReportActions({
  report,
  can,
}: {
  report: ReportDetail;
  can: Record<"triage" | "resolve" | "escalated", boolean>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = ["open", "investigating", "escalated"].includes(report.status);

  async function run(action: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const result = await apiFetch("POST", `staff/reports/${report.id}/${action}`, {
      row_version: report.row_version,
      ...body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(`${result.message} ${Object.values(result.fields).flat().join(" ")}`.trim());
      return false;
    }
    setMode(null);
    router.refresh();
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") ?? "").trim();
    const choice = String(form.get("choice") ?? "");
    if (mode === "note") await run("note", { note });
    if (mode === "escalate") await run("escalate", { note });
    if (mode === "reopen") await run("reopen", { note });
    if (mode === "resolve") await run("resolve", { resolution: choice, note });
    if (mode === "dismiss") await run("dismiss", { resolution: choice, note });
    if (mode === "listing")
      await run("listing", {
        listing_action: choice,
        note,
        reason_code: choice === "takedown" ? String(form.get("reason_code") ?? "other") : "other",
      });
  }

  const choices =
    mode === "resolve"
      ? RESOLUTIONS
      : mode === "dismiss"
        ? DISMISSALS
        : mode === "listing"
          ? LISTING_ACTIONS
          : null;
  return (
    <div className="grid gap-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!mode ? (
        <div className="flex flex-wrap gap-2">
          {open && report.status === "open" && can.triage ? (
            <Button onClick={() => void run("investigate", {})} disabled={busy}>
              Start investigating
            </Button>
          ) : null}
          {open && can.triage ? (
            <Button variant="secondary" onClick={() => setMode("note")}>
              Add a note
            </Button>
          ) : null}
          {open && can.resolve ? (
            <Button variant="secondary" onClick={() => setMode("resolve")}>
              Resolve
            </Button>
          ) : null}
          {open && can.resolve ? (
            <Button variant="secondary" onClick={() => setMode("dismiss")}>
              Dismiss
            </Button>
          ) : null}
          {open && can.resolve ? (
            <Button variant="danger" onClick={() => setMode("listing")}>
              Act on the listing
            </Button>
          ) : null}
          {open && report.status !== "escalated" && can.triage ? (
            <Button variant="secondary" onClick={() => setMode("escalate")}>
              Escalate to an administrator
            </Button>
          ) : null}
          {!open && can.escalated ? (
            <Button variant="secondary" onClick={() => setMode("reopen")}>
              Reopen
            </Button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3 rounded-card border border-line p-4" noValidate>
          {choices ? (
            <Field id="rp-choice" label={mode === "dismiss" ? "Why" : "Outcome"}>
              <Select id="rp-choice" name="choice" defaultValue={choices[0][0]}>
                {choices.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "listing" ? (
            <Field id="rp-code" label="Reason code (take down only)">
              <Select id="rp-code" name="reason_code" defaultValue="other">
                {["legal", "error", "fraud", "other"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field
            id="rp-note"
            label="Note"
            hint="What you found or did (at least 10 characters). Kept in the report history."
          >
            <Textarea id="rp-note" name="note" rows={4} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {report.is_participant && open ? (
        <p className="text-small text-muted">
          You wrote, submitted or created this listing, so you can add notes and escalate but not close the
          report.
        </p>
      ) : null}
    </div>
  );
}
