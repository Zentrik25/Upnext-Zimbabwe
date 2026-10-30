"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Checkbox, Field, Select, Textarea, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { humanise } from "@/lib/format";
import { LookupSelect } from "./lookup-select";
import type { ActionField, StaffAction } from "@/lib/staff-types";

type Values = Record<string, string | boolean>;

function start(fields: ActionField[], defaults: Record<string, string | number>): Values {
  const out: Values = {};
  for (const f of fields) out[f.name] = f.kind === "boolean" ? false : String(defaults[f.name] ?? "");
  return out;
}

/**
 * The editorial actions this person may attempt on a listing. Every button posts to the publishing service,
 * which decides again (permission, separation of duties, the exact revision, audit); this panel only shows what
 * the service said is possible and carries the row version the person was looking at.
 */
export function ActionPanel({
  endpoint,
  editHref,
  rowVersion,
  actions,
  initial,
  defaults = {},
  noActionsText = "No actions are available to you here right now. Review and approval need a different person from whoever wrote or submitted it.",
}: {
  /** The API path that actions post to, without the action name: `staff/opportunities/<id>/actions`. */
  endpoint: string;
  /** Where the "edit" pseudo-action goes (listings only). */
  editHref?: string;
  /** The version the person was looking at; null for records that have none. */
  rowVersion: number | null;
  actions: StaffAction[];
  initial?: string;
  defaults?: Record<string, string | number>;
  noActionsText?: string;
}) {
  const router = useRouter();
  const doable = actions.filter((a) => a.name !== "edit");
  const edit = actions.find((a) => a.name === "edit");
  const first = doable.find((a) => a.name === initial);
  const [current, setCurrent] = useState<string | null>(first?.name ?? null);
  const [values, setValues] = useState<Values>(first ? start(first.fields ?? [], defaults) : {});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const action = doable.find((a) => a.name === current) ?? null;

  function choose(a: StaffAction) {
    setCurrent(a.name);
    setValues(start(a.fields ?? [], defaults));
    setErrors({});
    setFailure(null);
    setDone(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setErrors({});
    setFailure(null);
    const body: Record<string, unknown> = rowVersion === null ? {} : { row_version: rowVersion };
    for (const f of action.fields ?? []) {
      const v = values[f.name];
      body[f.name] = f.kind === "integer" && typeof v === "string" ? (v === "" ? null : Number(v)) : v;
    }
    const result = await apiFetch("POST", `${endpoint}/${action.name}`, body);
    setBusy(false);
    if (!result.ok) {
      if (result.code === "validation_failed" || result.code === "duplicate_detected")
        setErrors(result.fields);
      if (result.code === "state_conflict") router.refresh();
      setFailure(describeFailure(result));
      return;
    }
    setDone(`Done: ${action.label}.`);
    setCurrent(null);
    router.refresh();
  }

  if (!doable.length && !(edit && editHref)) {
    return (
      <div className="grid gap-3">
        {done ? <FormSuccess>{done}</FormSuccess> : null}
        <p className="m-0 text-ctl text-muted">{noActionsText}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {edit && editHref ? (
          <Link
            href={editHref}
            className="inline-flex min-h-control items-center rounded-control border border-border-strong px-4 py-2 text-ctl text-secondary-text hover:bg-accent/5"
          >
            {edit.label}
          </Link>
        ) : null}
        {doable.map((a) => (
          <Button
            key={a.name}
            variant={a.name === current ? "primary" : "secondary"}
            aria-pressed={a.name === current}
            onClick={() => choose(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {done ? <FormSuccess>{done}</FormSuccess> : null}
      {action ? (
        <form
          onSubmit={submit}
          noValidate
          className="grid max-w-[560px] gap-3 rounded-card border border-border-panel p-4"
          aria-label={action.label}
        >
          <h3 className="m-0 text-base font-medium">{action.label}</h3>
          {action.description ? <p className="m-0 text-ctl text-muted">{action.description}</p> : null}
          {failure ? <FormError>{failure}</FormError> : null}
          {(action.fields ?? []).map((f) => {
            const fid = `act-${action.name}-${f.name}`;
            const err = errors[f.name]?.[0];
            if (f.kind === "boolean")
              return (
                <div key={f.name} className="grid gap-1">
                  <Checkbox
                    id={fid}
                    label={f.label}
                    checked={values[f.name] === true}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })}
                    aria-invalid={err ? true : undefined}
                  />
                  {f.help ? <p className="m-0 text-small text-muted">{f.help}</p> : null}
                  {err ? (
                    <p role="alert" className="m-0 text-small text-danger">
                      <span className="font-strong">Error:</span> {err}
                    </p>
                  ) : null}
                </div>
              );
            return (
              <Field key={f.name} id={fid} label={f.label} hint={f.help || undefined} error={err}>
                {f.kind === "choice" ? (
                  <Select
                    id={fid}
                    value={String(values[f.name] ?? "")}
                    invalid={!!err}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {(f.choices ?? []).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                ) : f.kind === "reference" ? (
                  <LookupSelect
                    id={fid}
                    lookup={f.lookup ?? "organisations"}
                    value={String(values[f.name] ?? "")}
                    invalid={!!err}
                    onChange={(v) => setValues({ ...values, [f.name]: v })}
                  />
                ) : f.kind === "textarea" ? (
                  <Textarea
                    id={fid}
                    rows={4}
                    invalid={!!err}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  />
                ) : (
                  <TextInput
                    id={fid}
                    type={f.kind === "integer" ? "number" : "text"}
                    invalid={!!err}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  />
                )}
              </Field>
            );
          })}
          {errors.row_version?.[0] ? <FormError>{errors.row_version[0]}</FormError> : null}
          {Object.entries(errors).filter(
            ([k]) => k !== "row_version" && !(action.fields ?? []).some((f) => f.name === k),
          ).length ? (
            <ul className="m-0 grid gap-1 pl-5 text-ctl text-danger" aria-label="Problems with the listing">
              {Object.entries(errors)
                .filter(([k]) => k !== "row_version" && !(action.fields ?? []).some((f) => f.name === k))
                .map(([k, v]) => (
                  <li key={k}>
                    <span className="font-strong">{humanise(k.replace(/[._]/g, " "))}:</span> {v[0]}
                  </li>
                ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : action.fields?.length ? action.label : `Confirm: ${action.label}`}
            </Button>
            <Button variant="secondary" onClick={() => setCurrent(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
