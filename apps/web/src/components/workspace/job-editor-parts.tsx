"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FormError } from "@/components/account/parts";
import { Button, RichTextEditor, Select, TextInput } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { APPLY_METHODS, type ApplyMethod, type EditorState } from "@/lib/job-editor";

const label = "text-ctl font-medium text-check-text";
const error = "m-0 text-small text-danger";

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={error}>
      <span className="font-strong">Error:</span> {message}
    </p>
  );
}

/** A labelled block: label, optional hint, the control, then the inline error. Keeps every control named. */
export function Row({
  id,
  title,
  hint,
  error: message,
  optional,
  children,
  className = "",
}: {
  id: string;
  title: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid content-start gap-1 ${className}`}>
      <label htmlFor={id} className={label}>
        {title}
        {optional ? <span className="font-light text-muted"> (optional)</span> : null}
      </label>
      {children}
      {hint && !message ? (
        <p id={`${id}-hint`} className="m-0 text-small text-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={message} />
    </div>
  );
}

type Org = { id: string; name: string };

/** Search the existing organisations; an authorised person can add one that is missing without leaving the form. */
export function OrganisationPicker({
  id = "organisation",
  value,
  onChange,
  canCreate,
  error: message,
}: {
  id?: string;
  value: Org | null;
  onChange: (org: Org | null) => void;
  canCreate: boolean;
  error?: string;
}) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/staff/lookup/organisations?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (r.ok) setOptions(((await r.json()) as { data: Org[] }).data);
      } catch {
        /* keep what is shown */
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, open]);

  const exact = options.some((o) => o.name.toLowerCase() === term.trim().toLowerCase());
  const offerAdd = canCreate && term.trim().length >= 2 && !exact;

  function choose(org: Org) {
    onChange(org);
    setOpen(false);
    setTerm("");
  }

  async function add() {
    setBusy(true);
    setFailure(null);
    const result = await apiFetch<{ id: string; title: string }>("POST", "staff/catalog/organisations", {
      name: name.trim(),
      website_url: website.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(
        result.code === "validation_failed"
          ? (Object.values(result.fields).flat()[0] ?? describeFailure(result))
          : describeFailure(result),
      );
      return;
    }
    choose({ id: result.data.id, name: result.data.title });
    setAdding(false);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <TextInput id={id} readOnly value={value.name} />
        <Button variant="secondary" onClick={() => onChange(null)} className="min-h-field shrink-0 px-3">
          Change<span className="sr-only"> organisation</span>
        </Button>
      </div>
    );
  }
  return (
    <div className="relative grid gap-1">
      <TextInput
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        placeholder="Search organisations"
        value={term}
        invalid={Boolean(message)}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Organisations"
          className="m-0 max-h-[220px] list-none overflow-auto rounded-control border border-control-border bg-surface p-0 shadow-subtle"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-ctl ${i === active ? "bg-surface-pale" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              {o.name}
            </li>
          ))}
          {!options.length ? (
            <li className="px-3 py-2 text-ctl text-muted">No organisation matches.</li>
          ) : null}
          {offerAdd ? (
            <li role="presentation" className="border-t border-line p-1">
              <Button
                variant="secondary"
                className="w-full justify-start text-small"
                onClick={() => {
                  setName(term.trim());
                  setAdding(true);
                  setOpen(false);
                }}
              >
                Add “{term.trim()}” as a new organisation
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {adding ? (
        <div
          role="group"
          aria-label="New organisation"
          className="grid gap-2 rounded-card border border-border-panel p-3"
        >
          {failure ? <FormError>{failure}</FormError> : null}
          <Row id={`${id}-new-name`} title="Organisation name">
            <TextInput
              id={`${id}-new-name`}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </Row>
          <Row id={`${id}-new-site`} title="Website" optional hint="Its own address, starting with https://">
            <TextInput
              id={`${id}-new-site`}
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Row>
          <div className="flex gap-2">
            <Button disabled={busy || name.trim().length < 2} onClick={add}>
              {busy ? "Adding…" : "Add organisation"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One selector; only the fields that method needs appear. A source link is never mistaken for the destination. */
export function ApplyFields({
  state,
  set,
  errors,
}: {
  state: EditorState;
  set: (patch: Partial<EditorState>) => void;
  errors: Record<string, string | undefined>;
}) {
  const id = "apply";
  const m: ApplyMethod = state.applyMethod;
  return (
    <div className="grid gap-3">
      <Select
        id={`${id}-method`}
        aria-label="How people apply"
        value={m}
        onChange={(e) => set({ applyMethod: e.target.value as ApplyMethod })}
      >
        {APPLY_METHODS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {m === "external_url" || m === "both" ? (
        <Row
          id={`${id}-url`}
          title="Application website"
          hint="The page where people really apply, not a news article or a WhatsApp promotion. Button: Apply Now."
          error={errors.application_url}
        >
          <TextInput
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={state.applyUrl}
            invalid={Boolean(errors.application_url)}
            aria-describedby={errors.application_url ? `${id}-url-error` : `${id}-url-hint`}
            onChange={(e) => set({ applyUrl: e.target.value })}
          />
        </Row>
      ) : null}
      {m === "email" || m === "both" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Row
            id={`${id}-email`}
            title="Application e-mail"
            error={errors.application_email}
            hint="Button: Apply via Email."
          >
            <TextInput
              id={`${id}-email`}
              type="email"
              value={state.applyEmail}
              invalid={Boolean(errors.application_email)}
              aria-describedby={errors.application_email ? `${id}-email-error` : `${id}-email-hint`}
              onChange={(e) => set({ applyEmail: e.target.value })}
            />
          </Row>
          <Row id={`${id}-subject`} title="E-mail subject" optional error={errors.application_email_subject}>
            <TextInput
              id={`${id}-subject`}
              maxLength={150}
              value={state.applySubject}
              onChange={(e) => set({ applySubject: e.target.value })}
            />
          </Row>
        </div>
      ) : null}
      <RichTextEditor
        id={`${id}-instructions`}
        title={m === "instructions" ? "Application instructions" : "Short instructions"}
        optional={m !== "instructions"}
        hint={
          m === "instructions"
            ? "Say how to apply, as the source does. No application destination is shown."
            : "For example the reference to quote, or documents to attach."
        }
        value={state.applyInstructions}
        onChange={(applyInstructions) => set({ applyInstructions })}
        error={errors.application_instructions}
        minHeight={96}
      />
    </div>
  );
}
