"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Checkbox, Field, Select, Textarea, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import type { CatalogRecord } from "@/lib/staff-types";
import { LookupSelect } from "./lookup-select";

type Values = Record<string, string | number | boolean>;
type Props = {
  kind: string;
  fields: CatalogRecord["fields"];
  /** Present when editing; the form creates a record when absent. */
  record?: CatalogRecord;
  readOnly?: boolean;
};

/** Create or edit one reference record (organisation, category, location, sector, skill) from its schema. */
export function CatalogForm({ kind, fields, record, readOnly }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => {
    const out: Values = {};
    for (const f of fields) out[f.name] = record?.values[f.name] ?? (f.kind === "boolean" ? true : "");
    return out;
  });
  const [rowVersion, setRowVersion] = useState(record?.row_version ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFailure(null);
    setSaved(false);
    const body: Record<string, unknown> = { ...values };
    for (const f of fields) {
      if (f.kind === "integer") body[f.name] = values[f.name] === "" ? null : Number(values[f.name]);
      if (f.kind === "reference" && values[f.name] === "") body[f.name] = null;
    }
    if (record && rowVersion !== null) body.row_version = rowVersion;
    const result = record
      ? await apiFetch<CatalogRecord>("PATCH", `staff/catalog/${kind}/${record.id}`, body)
      : await apiFetch<CatalogRecord>("POST", `staff/catalog/${kind}`, body);
    setBusy(false);
    if (!result.ok) {
      if (result.code === "validation_failed") setErrors(result.fields);
      setFailure(describeFailure(result));
      return;
    }
    if (!record) {
      router.push(`/workspace/manage/${kind}`);
      router.refresh();
      return;
    }
    setRowVersion(result.data.row_version);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-[560px] gap-4">
      {failure ? <FormError>{failure}</FormError> : null}
      {saved ? <FormSuccess>Saved.</FormSuccess> : null}
      {record &&
        Object.entries(record.readonly).map(([k, v]) => (
          <p key={k} className="m-0 text-ctl text-muted">
            {k.charAt(0).toUpperCase() + k.slice(1)}: <code className="font-mono">{v}</code> (fixed)
          </p>
        ))}
      {fields.map((f) => {
        const id = `cat-${f.name}`;
        const err = errors[f.name]?.[0];
        const value = values[f.name];
        if (f.kind === "boolean")
          return (
            <Checkbox
              key={f.name}
              id={id}
              label={f.label}
              checked={value === true}
              disabled={readOnly}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })}
            />
          );
        return (
          <Field key={f.name} id={id} label={f.label} hint={f.help || undefined} error={err}>
            {f.kind === "choice" ? (
              <Select
                id={id}
                value={String(value)}
                disabled={readOnly}
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
                id={id}
                lookup={f.lookup ?? "locations"}
                value={String(value)}
                invalid={!!err}
                onChange={(v) => setValues({ ...values, [f.name]: v })}
                blank="None"
              />
            ) : f.kind === "textarea" ? (
              <Textarea
                id={id}
                rows={4}
                value={String(value)}
                disabled={readOnly}
                invalid={!!err}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            ) : (
              <TextInput
                id={id}
                type={f.kind === "integer" ? "number" : "text"}
                value={String(value)}
                disabled={readOnly}
                invalid={!!err}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            )}
          </Field>
        );
      })}
      {readOnly ? (
        <p className="m-0 text-ctl text-muted">You can read this record but not change it.</p>
      ) : (
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : record ? "Save changes" : "Add"}
          </Button>
        </div>
      )}
    </form>
  );
}
