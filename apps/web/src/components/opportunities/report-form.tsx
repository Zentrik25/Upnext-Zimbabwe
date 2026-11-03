"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Field, Textarea, TextInput } from "@/components/ui";
import { FormError, FormSuccess } from "@/components/account/parts";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";

export const REPORT_REASONS = [
  { value: "fake_job", label: "Suspected fake job" },
  { value: "payment_scam", label: "Recruitment scam or payment request" },
  { value: "incorrect_application", label: "Incorrect application information" },
  { value: "expired", label: "Expired listing" },
  { value: "misleading", label: "Misleading content" },
  { value: "duplicate", label: "Duplicate listing" },
  { value: "other", label: "Other concern" },
] as const;

export const DETAILS_MIN = 10;
export const DETAILS_MAX = 2000;

type Receipt = { reference: string };

/** Report a public listing. No account, no file upload; a report never removes a listing by itself. */
export function ReportForm({ slug, title }: { slug: string; title: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [count, setCount] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (receipt) done.current?.focus();
  }, [receipt]);

  const firstError = Object.keys(errors)[0];
  useEffect(() => {
    if (firstError) summary.current?.focus();
  }, [firstError, errors]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "");
    const details = String(form.get("details") ?? "").trim();
    // Same limits as the server, so most mistakes are caught before a request is made.
    const local: FieldErrors = {};
    if (!reason) local.reason = ["Choose what is wrong with this opportunity."];
    if (details.length < DETAILS_MIN) local.details = [`Write at least ${DETAILS_MIN} characters.`];
    if (details.length > DETAILS_MAX) local.details = [`Write at most ${DETAILS_MAX} characters.`];
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFailure(null);
      return;
    }
    setBusy(true);
    setErrors({});
    setFailure(null);
    const outcome = await apiFetch<Receipt>("POST", `opportunities/${encodeURIComponent(slug)}/reports`, {
      reason,
      details,
      evidence_url: String(form.get("evidence_url") ?? "").trim() || null,
      contact_email: String(form.get("contact_email") ?? "").trim() || null,
      website: String(form.get("website") ?? ""),
    });
    setBusy(false);
    if (outcome.ok) setReceipt(outcome.data);
    else if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else if (outcome.code === "not_found") setFailure("This opportunity is no longer available to report.");
    else setFailure(describeFailure(outcome));
  }

  if (receipt) {
    return (
      <div ref={done} tabIndex={-1} className="outline-none" data-testid="report-done">
        <FormSuccess>
          <p className="font-strong">Thank you. We have received your report.</p>
          <p className="mt-1">
            Your reference is <strong data-testid="report-reference">{receipt.reference}</strong>. Staff will
            check it. The opportunity is not removed automatically, and we may not be able to reply to every
            report.
          </p>
        </FormSuccess>
        <p className="mt-4 text-base">
          <Link href={`/opportunities/${slug}`} className="text-accent underline">
            Back to the opportunity
          </Link>
        </p>
      </div>
    );
  }

  const messages = Object.entries(errors);
  return (
    <form onSubmit={submit} noValidate className="grid gap-5" data-testid="report-form">
      {failure ? <FormError>{failure}</FormError> : null}
      {messages.length > 0 ? (
        <div
          ref={summary}
          tabIndex={-1}
          role="alert"
          className="border border-danger p-[10px] text-base text-danger outline-none"
        >
          <p className="font-strong">Check the form: {messages.length} to fix.</p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {messages.map(([field, list]) => (
              <li key={field}>
                <a href={`#${field === "reason" ? "reason-fieldset" : field}`} className="underline">
                  {list[0]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset
        id="reason-fieldset"
        className="grid gap-2 border-0 p-0"
        aria-describedby={errors.reason ? "reason-error" : undefined}
      >
        <legend className="mb-1 text-small font-strong">What is wrong with “{title}”?</legend>
        {REPORT_REASONS.map((item) => (
          <label key={item.value} className="flex min-h-control items-center gap-2 text-base">
            <input type="radio" name="reason" value={item.value} className="accent-accent" required />
            {item.label}
          </label>
        ))}
        {errors.reason ? (
          <p id="reason-error" role="alert" className="text-small text-danger">
            <span className="font-strong">Error:</span> {errors.reason[0]}
          </p>
        ) : null}
      </fieldset>
      <Field
        id="details"
        label="Tell us what concerns you"
        hint={`${DETAILS_MIN} to ${DETAILS_MAX} characters. Plain text. Do not include passwords, bank or ID numbers, or other people's personal details.`}
        error={errors.details?.[0]}
      >
        <Textarea
          id="details"
          name="details"
          rows={6}
          required
          maxLength={DETAILS_MAX}
          invalid={Boolean(errors.details)}
          onChange={(event) => setCount(event.target.value.length)}
          aria-describedby={errors.details ? "details-error" : "details-hint details-count"}
        />
        <p id="details-count" className="text-small text-muted" aria-live="off">
          {count} of {DETAILS_MAX} characters
        </p>
      </Field>
      <Field
        id="evidence_url"
        label="Link that shows the problem (optional)"
        hint="A web address starting with https://. We will not open it automatically. We cannot accept files."
        error={errors.evidence_url?.[0]}
      >
        <TextInput
          id="evidence_url"
          name="evidence_url"
          type="url"
          inputMode="url"
          autoComplete="off"
          maxLength={500}
          invalid={Boolean(errors.evidence_url)}
        />
      </Field>
      <Field
        id="contact_email"
        label="Your e-mail address (optional)"
        hint="Only if you are happy for staff to contact you with one question. It is removed after the report is closed."
        error={errors.contact_email?.[0]}
      >
        <TextInput
          id="contact_email"
          name="contact_email"
          type="email"
          autoComplete="email"
          maxLength={254}
          invalid={Boolean(errors.contact_email)}
        />
      </Field>
      {/* Honeypot: invisible and unreachable for people and assistive technology; bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-small text-muted">
        We do not store your IP address and you do not need an account. A report is a tip for our staff; it
        does not remove the opportunity by itself.
      </p>
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send report"}
        </Button>
      </div>
    </form>
  );
}
