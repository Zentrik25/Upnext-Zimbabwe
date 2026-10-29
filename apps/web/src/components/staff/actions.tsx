"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Checkbox, Field, Select, Textarea, TextInput, type ButtonVariant } from "@/components/ui";
import { apiFetch } from "@/lib/client-api";
import type { Choice } from "@/lib/staff-types";
import { Notice } from "./primitives";

type Need = "reason" | "reason_code" | "takedown_code" | "checklist" | "verify";
type Spec = {
  label: string;
  variant: ButtonVariant;
  title: string;
  body?: string;
  needs: Need[];
  submit: string;
};

const REJECT_CODES: Choice[] = [
  { value: "source_unclear", label: "Source unclear" },
  { value: "incomplete", label: "Incomplete" },
  { value: "inaccurate", label: "Inaccurate" },
  { value: "duplicate", label: "Duplicate" },
  { value: "policy", label: "Against policy" },
  { value: "other", label: "Other" },
];
const TAKEDOWN_CODES: Choice[] = [
  { value: "legal", label: "Legal" },
  { value: "error", label: "Error" },
  { value: "fraud", label: "Fraud" },
  { value: "other", label: "Other" },
];

export const SPECS: Record<string, Spec> = {
  submit: {
    label: "Submit for review",
    variant: "primary",
    title: "Submit for review",
    body: "Another Editor or Administrator will review the exact revision. You cannot approve it yourself.",
    needs: [],
    submit: "Submit",
  },
  publish_direct: {
    label: "Publish now",
    variant: "primary",
    title: "Publish now",
    body: "You are publishing your own listing without a second person's approval (direct publishing for Administrators and Editors, D-46). It goes live on the public site immediately. The action is recorded as direct and self-approved. Verification of the source stays a separate step another person records.",
    needs: ["checklist"],
    submit: "Publish now",
  },
  approve: {
    label: "Approve",
    variant: "primary",
    title: "Approve this revision",
    body: "Approval covers this exact revision; any later change needs a new approval.",
    needs: ["checklist"],
    submit: "Approve",
  },
  reject: {
    label: "Reject",
    variant: "danger",
    title: "Reject this revision",
    body: "The author sees the reason.",
    needs: ["reason_code", "reason"],
    submit: "Reject",
  },
  return: {
    label: "Return",
    variant: "danger",
    title: "Return the approved revision",
    body: "The approval is voided and the author sees the reason.",
    needs: ["reason_code", "reason"],
    submit: "Return",
  },
  publish: {
    label: "Publish",
    variant: "primary",
    title: "Publish",
    body: "This revision was approved by another person and goes live on the public site now.",
    needs: [],
    submit: "Publish",
  },
  withdraw: {
    label: "Withdraw",
    variant: "danger",
    title: "Withdraw this listing",
    body: "It stays reachable by its address but is marked as withdrawn and leaves search.",
    needs: ["reason"],
    submit: "Withdraw",
  },
  expire: {
    label: "Mark expired",
    variant: "secondary",
    title: "Mark as expired",
    needs: ["reason"],
    submit: "Mark expired",
  },
  takedown: {
    label: "Take down",
    variant: "danger",
    title: "Take down this listing",
    body: "Use for legal or safety reasons. The reason is kept in the audit log.",
    needs: ["takedown_code", "reason"],
    submit: "Take down",
  },
  archive: {
    label: "Archive",
    variant: "secondary",
    title: "Archive this listing",
    needs: [],
    submit: "Archive",
  },
  discard: {
    label: "Discard draft",
    variant: "danger",
    title: "Discard this revision",
    body: "The revision is closed and cannot be edited again.",
    needs: [],
    submit: "Discard",
  },
  reopen: {
    label: "Reopen as draft",
    variant: "secondary",
    title: "Reopen as a new draft",
    needs: [],
    submit: "Reopen",
  },
  amend: {
    label: "Amend",
    variant: "secondary",
    title: "Start an amendment",
    body: "This creates a new draft revision. The live listing stays unchanged until the amendment is published.",
    needs: [],
    submit: "Start amendment",
  },
  verify: {
    label: "Record verification",
    variant: "secondary",
    title: "Record a verification",
    body: "Verification is recorded by someone who did not write or submit the listing.",
    needs: ["verify"],
    submit: "Record",
  },
};

const CHECKS: { key: string; label: string }[] = [
  { key: "source_reviewed", label: "I reviewed the cited source" },
  { key: "duplicates_reviewed", label: "I reviewed possible duplicates" },
  { key: "content_matches_source", label: "The content matches the source" },
];

type Props = {
  opportunityId: string;
  rowVersion: number;
  action: string;
  compact?: boolean;
  /** Where to go after success when the listing may no longer exist (discard). */
  afterTo?: string;
  verifyChoices?: { level: Choice[]; method: Choice[]; outcome: Choice[] };
  /** Changing to a higher number opens the dialog (used by "Save and publish"). */
  openSignal?: number;
  disabled?: boolean;
};

/** A workflow button that opens a confirmation dialog collecting exactly what the service needs. */
export function ActionButton({
  opportunityId,
  rowVersion,
  action,
  compact,
  afterTo,
  verifyChoices,
  openSignal = 0,
  disabled,
}: Props) {
  const spec = SPECS[action];
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<{
    message: string;
    fields: Record<string, string[]>;
    code: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [needDuplicate, setNeedDuplicate] = useState(false);

  useEffect(() => {
    if (openSignal > 0 && !dialog.current?.open) dialog.current?.showModal();
  }, [openSignal]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const onClose = () => setError(null);
    node.addEventListener("close", onClose);
    return () => node.removeEventListener("close", onClose);
  }, []);

  if (!spec) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const body: Record<string, unknown> = { row_version: rowVersion };
    if (spec!.needs.includes("reason")) body.reason = text("reason");
    if (spec!.needs.includes("reason_code") || spec!.needs.includes("takedown_code"))
      body.reason_code = text("reason_code");
    if (spec!.needs.includes("checklist")) {
      body.checklist = Object.fromEntries(CHECKS.map((c) => [c.key, checked[c.key] === true]));
      if (checked.applicant_payment_reviewed)
        (body.checklist as Record<string, boolean>).applicant_payment_reviewed = true;
    }
    if (spec!.needs.includes("verify")) {
      body.level = text("level");
      body.method = text("method");
      body.outcome = text("outcome");
      body.evidence_note = text("evidence_note");
    }
    if (needDuplicate && text("duplicate_of")) {
      body.duplicate_acknowledgement = {
        duplicate_of: text("duplicate_of"),
        reason: text("duplicate_reason"),
      };
    }
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ status?: string }>(
      "POST",
      `staff/opportunities/${opportunityId}/${action}`,
      body,
    );
    setBusy(false);
    if (!result.ok) {
      if (result.code === "duplicate_detected") setNeedDuplicate(true);
      setError({ message: result.message, fields: result.fields, code: result.code });
      return;
    }
    dialog.current?.close();
    if (afterTo && (action === "discard" || result.data?.status === "archived")) router.push(afterTo);
    else router.refresh();
  }

  const fieldErrors = error ? Object.entries(error.fields) : [];
  return (
    <>
      <Button
        variant={spec.variant}
        onClick={() => dialog.current?.showModal()}
        disabled={disabled}
        className={compact ? "min-h-[32px] px-2.5 py-1 text-small" : undefined}
      >
        {spec.label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`dlg-${action}-${opportunityId}`}
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-feature border border-border-panel bg-surface p-0 text-ink shadow-deep backdrop:bg-overlay"
      >
        <form onSubmit={onSubmit} className="grid gap-4 p-6 max-sm:p-4" noValidate>
          <h2 id={`dlg-${action}-${opportunityId}`} className="text-title tracking-title">
            {spec.title}
          </h2>
          {spec.body ? <p className="text-ctl text-muted">{spec.body}</p> : null}
          {error ? (
            <Notice tone="error">
              {error.message}
              {fieldErrors.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {fieldErrors.map(([field, messages]) => (
                    <li key={field}>
                      {field.replaceAll("_", " ")}: {messages.join(" ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          ) : null}
          {spec.needs.includes("checklist") ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-ctl font-medium text-check-text">Checklist (all required)</legend>
              {CHECKS.map((check) => (
                <Checkbox
                  key={check.key}
                  id={`chk-${action}-${check.key}-${opportunityId}`}
                  label={check.label}
                  checked={checked[check.key] === true}
                  onChange={(e) => setChecked({ ...checked, [check.key]: e.target.checked })}
                />
              ))}
              <Checkbox
                id={`chk-${action}-pay-${opportunityId}`}
                label="I reviewed any mention of payments by applicants (only if the text mentions fees)"
                checked={checked.applicant_payment_reviewed === true}
                onChange={(e) => setChecked({ ...checked, applicant_payment_reviewed: e.target.checked })}
              />
            </fieldset>
          ) : null}
          {spec.needs.includes("reason_code") ? (
            <Field id={`rc-${action}`} label="Reason">
              <Select id={`rc-${action}`} name="reason_code" defaultValue="">
                <option value="" disabled>
                  Choose a reason
                </option>
                {REJECT_CODES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {spec.needs.includes("takedown_code") ? (
            <Field id={`rc-${action}`} label="Reason">
              <Select id={`rc-${action}`} name="reason_code" defaultValue="">
                <option value="" disabled>
                  Choose a reason
                </option>
                {TAKEDOWN_CODES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {spec.needs.includes("reason") ? (
            <Field
              id={`why-${action}`}
              label="Explanation"
              hint="At least 10 characters. Recorded in the history."
            >
              <Textarea id={`why-${action}`} name="reason" rows={4} />
            </Field>
          ) : null}
          {spec.needs.includes("verify") && verifyChoices ? (
            <>
              <Field id="v-level" label="Level">
                <Select id="v-level" name="level" defaultValue="source_checked">
                  {verifyChoices.level
                    .filter((c) => c.value !== "not_verified")
                    .map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field id="v-method" label="Method" hint="Verified with the issuer needs “Issuer contact”.">
                <Select id="v-method" name="method" defaultValue="source_page_review">
                  {verifyChoices.method.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="v-outcome" label="Outcome">
                <Select id="v-outcome" name="outcome" defaultValue="confirmed">
                  {verifyChoices.outcome.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                id="v-note"
                label="Evidence note"
                hint="What you checked and how (20 to 2000 characters)."
              >
                <Textarea id="v-note" name="evidence_note" rows={4} />
              </Field>
            </>
          ) : null}
          {needDuplicate ? (
            <fieldset className="grid gap-3 rounded-card border border-line p-3">
              <legend className="px-1 text-ctl text-check-text">Deliberate separate listing</legend>
              <Field id="dup-of" label="Existing listing id">
                <TextInput id="dup-of" name="duplicate_of" />
              </Field>
              <Field id="dup-why" label="Why it is separate" hint="At least 10 characters.">
                <Textarea id="dup-why" name="duplicate_reason" rows={3} />
              </Field>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant={spec.variant === "danger" ? "danger" : "primary"} disabled={busy}>
              {busy ? "Working…" : spec.submit}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
