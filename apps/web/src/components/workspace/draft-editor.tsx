"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Checkbox, Field, Select, Textarea, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { humanise } from "@/lib/format";
import type { DetailField, DraftContent, ListingDetail, SourceRow, StaffCategory } from "@/lib/staff-types";

type Option = { id: string; name: string };
const pairs = (items: [string, string][]) => items;
const WORK_MODES = pairs([
  ["on_site", "On site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
]);
const EMPLOYMENT = pairs([
  ["permanent", "Permanent"],
  ["contract", "Contract"],
  ["temporary", "Temporary"],
  ["part_time", "Part time"],
  ["internship", "Internship"],
  ["trainee", "Trainee"],
]);
const EXPERIENCE = pairs([
  ["none", "No experience needed"],
  ["entry", "Entry level"],
  ["mid", "Mid level"],
  ["senior", "Senior"],
  ["executive", "Executive"],
]);
const PERIODS = pairs([
  ["hour", "per hour"],
  ["day", "per day"],
  ["month", "per month"],
  ["year", "per year"],
  ["once", "one-off"],
]);
const CURRENCIES = pairs([
  ["USD", "USD"],
  ["ZWG", "ZWG"],
]);
const METHODS = pairs([
  ["external_url", "A web page"],
  ["email", "E-mail"],
  ["instructions", "Written instructions"],
]);
const SOURCE_KINDS = pairs([
  ["issuer_website", "Issuer website"],
  ["issuer_notice", "Issuer notice"],
  ["government_gazette", "Government gazette"],
  ["newspaper", "Newspaper"],
  ["email_from_issuer", "E-mail from the issuer"],
  ["social_media", "Social media"],
  ["aggregator", "Aggregator"],
  ["other", "Other"],
]);

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const orNull = (value: string) => (value === "" ? null : value);

/** The calendar day of an end-of-day Harare deadline (Harare is UTC+2 all year). */
export function dayOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

function money(form: FormData, prefix: string) {
  const min = text(form, `${prefix}_min`);
  const max = text(form, `${prefix}_max`);
  if (!min && !max) return null;
  return {
    min: orNull(min),
    max: orNull(max),
    currency: orNull(text(form, `${prefix}_currency`)),
    period: orNull(text(form, `${prefix}_period`)),
  };
}

/** Reads the detail inputs of the category's schema. Only fields the editor filled in are sent. */
export function buildDetail(
  form: FormData,
  fields: DetailField[],
): { detail: Record<string, unknown>; errors: FieldErrors } {
  const detail: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const f of fields) {
    const key = `detail_${f.name}`;
    if (f.type === "array" && f.item_enum) {
      const picked = form.getAll(key).map(String);
      if (picked.length) detail[f.name] = picked;
    } else if (f.type === "array") {
      const lines = text(form, key)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) detail[f.name] = lines;
    } else if (f.type === "boolean") {
      const v = text(form, key);
      if (v === "yes") detail[f.name] = true;
      if (v === "no") detail[f.name] = false;
    } else if (f.type === "integer" || f.type === "number") {
      const v = text(form, key);
      if (v !== "") detail[f.name] = Number(v);
    } else if (f.type === "object") {
      const v = text(form, key);
      if (v !== "") {
        try {
          detail[f.name] = JSON.parse(v);
        } catch {
          errors[`detail.${f.name}`] = [
            'Enter valid JSON, for example {"amount": "50.00", "currency": "USD"}.',
          ];
        }
      }
    } else {
      const v = text(form, key);
      if (v !== "")
        detail[f.name] =
          f.format === "date-time" && !v.includes("+") && !v.endsWith("Z") ? `${v}:00+02:00` : v;
    }
  }
  return { detail, errors };
}

/** The request body for a draft (exported for tests). Anything the form does not edit is sent back unchanged. */
export function buildContent(
  form: FormData,
  category: StaffCategory,
  existing: DraftContent,
  sourceKeys: number[],
): { content: Record<string, unknown>; errors: FieldErrors } {
  const method = text(form, "application_method");
  const day = text(form, "deadline_day");
  const keepDeadline = day === dayOf(existing.deadline_at);
  const primary = text(form, "location_id");
  const { detail, errors } = buildDetail(form, category.detail_fields);
  const others = existing.locations
    .filter((l) => l.location_id !== primary && !l.is_primary)
    .map((l) => ({ location_id: l.location_id, is_primary: false }));
  const content: Record<string, unknown> = {
    title: text(form, "title"),
    summary: text(form, "summary"),
    description_md: text(form, "description_md"),
    requirements_md: orNull(text(form, "requirements_md")),
    locations: primary ? [{ location_id: primary, is_primary: true }, ...others] : [],
    location_text: orNull(text(form, "location_text")),
    geographic_eligibility: orNull(text(form, "geographic_eligibility")),
    work_mode: orNull(text(form, "work_mode")),
    employment_type: orNull(text(form, "employment_type")),
    experience_level: orNull(text(form, "experience_level")),
    salary: money(form, "salary"),
    funding: money(form, "funding"),
    application_method: method,
    application_url: method === "external_url" ? orNull(text(form, "application_url")) : null,
    application_email: method === "email" ? orNull(text(form, "application_email")) : null,
    application_instructions:
      method === "instructions" ? orNull(text(form, "application_instructions")) : null,
    reference_number: orNull(text(form, "reference_number")),
    contact_details: orNull(text(form, "contact_details")),
    skills: existing.skills.map((s) => ({ skill_id: s.skill_id, is_required: s.is_required })),
    sector_ids: form.getAll("sector").map(String),
    sources: sourceKeys
      .map((k) => ({
        kind: text(form, `source_${k}_kind`),
        name: text(form, `source_${k}_name`),
        url: orNull(text(form, `source_${k}_url`)),
        citation: orNull(text(form, `source_${k}_citation`)),
        observed_on: text(form, `source_${k}_observed_on`),
        is_primary: text(form, "source_primary") === String(k),
      }))
      .filter((s) => s.name || s.url || s.observed_on),
    detail,
  };
  if (!keepDeadline) {
    content.deadline_at = day ? `${day}T23:59:59+02:00` : null;
    content.deadline_timezone = day ? "Africa/Harare" : null;
    content.deadline_is_date_only = Boolean(day);
  }
  return { content, errors };
}

const section = "grid gap-4 rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const grid2 = "grid gap-4 sm:grid-cols-2";

function Opts({ items, blank }: { items: [string, string][]; blank?: string }) {
  return (
    <>
      {blank !== undefined ? <option value="">{blank}</option> : null}
      {items.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </>
  );
}

export function DraftEditor({
  listing,
  category,
  locations,
  sectors,
}: {
  listing: ListingDetail;
  category: StaffCategory;
  locations: Option[];
  sectors: Option[];
}) {
  const router = useRouter();
  const initial = listing.pending && !listing.pending.hidden ? listing.pending.content : null;
  const [rowVersion, setRowVersion] = useState(listing.row_version);
  const [method, setMethod] = useState(initial?.application_method ?? "external_url");
  const [keys, setKeys] = useState<number[]>(() =>
    initial?.sources.length ? initial.sources.map((_, i) => i) : [0],
  );
  const [nextKey, setNextKey] = useState(() => Math.max(1, initial?.sources.length ?? 0));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!initial) return <FormError>This draft cannot be edited here.</FormError>;
  const e = (key: string) => errors[key]?.[0];
  const sources: SourceRow[] = initial.sources;
  const primaryIndex = Math.max(
    0,
    sources.findIndex((s) => s.is_primary),
  );

  async function save(event: React.FormEvent<HTMLFormElement>, thenView: boolean) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    setSaved(false);
    const built = buildContent(form, category, initial as DraftContent, keys);
    if (Object.keys(built.errors).length) {
      setBusy(false);
      setErrors(built.errors);
      setFailure("Fix the points below, then save again.");
      return;
    }
    const result = await apiFetch<ListingDetail>("PATCH", `staff/opportunities/${listing.id}/draft`, {
      row_version: rowVersion,
      content: built.content,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "validation_failed") {
        setErrors(result.fields);
        setFailure("The draft was not saved. Fix the points below.");
      } else setFailure(describeFailure(result));
      return;
    }
    setRowVersion(result.data.row_version);
    if (thenView) router.push(`/workspace/opportunities/${listing.id}`);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  const flat = Object.entries(errors).filter(([k]) => !["title", "summary", "description_md"].includes(k));
  const primaryLocation =
    initial.locations.find((l) => l.is_primary)?.location_id ?? initial.locations[0]?.location_id ?? "";
  const money = (m: DraftContent["salary"]) => ({
    min: m?.min ?? "",
    max: m?.max ?? "",
    currency: m?.currency ?? "",
    period: m?.period ?? "",
  });
  const salary = money(initial.salary);
  const funding = money(initial.funding);
  const chosenSectors = new Set(initial.sector_ids);

  return (
    <form
      onSubmit={(ev) => save(ev, false)}
      className="grid max-w-[820px] gap-5"
      noValidate
      aria-label={`Edit draft: ${initial.title || "Untitled draft"}`}
    >
      {failure ? <FormError>{failure}</FormError> : null}
      {flat.length ? (
        <ul
          className="m-0 grid gap-1 rounded-card border border-danger p-3 pl-7 text-ctl text-danger"
          aria-label="Problems to fix"
        >
          {flat.map(([k, v]) => (
            <li key={k}>
              <span className="font-strong">{humanise(k.replace(/\./g, " "))}:</span> {v[0]}
            </li>
          ))}
        </ul>
      ) : null}
      {saved ? <FormSuccess>Draft saved.</FormSuccess> : null}

      <fieldset className={section}>
        <legend className="px-1 text-base font-medium">Basics</legend>
        <Field id="title" label="Opportunity title" error={e("title")}>
          <TextInput
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={initial.title}
            invalid={!!e("title")}
          />
        </Field>
        <Field
          id="summary"
          label="Summary"
          hint="One or two plain sentences, up to 300 characters."
          error={e("summary")}
        >
          <Textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={300}
            defaultValue={initial.summary}
            invalid={!!e("summary")}
          />
        </Field>
        <Field
          id="description_md"
          label="Description"
          hint="Plain text with simple Markdown. Copy only what the source says."
          error={e("description_md")}
        >
          <Textarea
            id="description_md"
            name="description_md"
            rows={9}
            defaultValue={initial.description_md}
            invalid={!!e("description_md")}
          />
        </Field>
        <Field
          id="requirements_md"
          label="Responsibilities, qualifications and requirements"
          error={e("requirements_md")}
        >
          <Textarea
            id="requirements_md"
            name="requirements_md"
            rows={6}
            defaultValue={initial.requirements_md ?? ""}
          />
        </Field>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-base font-medium">Where and what kind</legend>
        <div className={grid2}>
          <Field id="location_id" label="Primary location">
            <Select id="location_id" name="location_id" defaultValue={primaryLocation}>
              <option value="">Not stated</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="location_text" label="Location, as written" error={e("location_text")}>
            <TextInput
              id="location_text"
              name="location_text"
              maxLength={200}
              defaultValue={initial.location_text ?? ""}
            />
          </Field>
          <Field id="work_mode" label="Work arrangement">
            <Select id="work_mode" name="work_mode" defaultValue={initial.work_mode ?? ""}>
              <Opts items={WORK_MODES} blank="Not stated" />
            </Select>
          </Field>
          <Field id="employment_type" label="Employment type">
            <Select id="employment_type" name="employment_type" defaultValue={initial.employment_type ?? ""}>
              <Opts items={EMPLOYMENT} blank="Not stated" />
            </Select>
          </Field>
          <Field id="experience_level" label="Experience level">
            <Select
              id="experience_level"
              name="experience_level"
              defaultValue={initial.experience_level ?? ""}
            >
              <Opts items={EXPERIENCE} blank="Not stated" />
            </Select>
          </Field>
          <Field
            id="geographic_eligibility"
            label="Who may apply, and from where"
            hint="Say it when the source does."
            error={e("geographic_eligibility")}
          >
            <TextInput
              id="geographic_eligibility"
              name="geographic_eligibility"
              maxLength={500}
              defaultValue={initial.geographic_eligibility ?? ""}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-base font-medium">Pay or funding (only what the source states)</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="salary_min" label="Pay from" error={e("salary")}>
            <TextInput id="salary_min" name="salary_min" inputMode="decimal" defaultValue={salary.min} />
          </Field>
          <Field id="salary_max" label="Pay to">
            <TextInput id="salary_max" name="salary_max" inputMode="decimal" defaultValue={salary.max} />
          </Field>
          <Field id="salary_currency" label="Currency">
            <Select id="salary_currency" name="salary_currency" defaultValue={salary.currency}>
              <Opts items={CURRENCIES} blank="-" />
            </Select>
          </Field>
          <Field id="salary_period" label="Period">
            <Select id="salary_period" name="salary_period" defaultValue={salary.period}>
              <Opts items={PERIODS} blank="-" />
            </Select>
          </Field>
          <Field id="funding_min" label="Funding from" error={e("funding")}>
            <TextInput id="funding_min" name="funding_min" inputMode="decimal" defaultValue={funding.min} />
          </Field>
          <Field id="funding_max" label="Funding to">
            <TextInput id="funding_max" name="funding_max" inputMode="decimal" defaultValue={funding.max} />
          </Field>
          <Field id="funding_currency" label="Currency">
            <Select id="funding_currency" name="funding_currency" defaultValue={funding.currency}>
              <Opts items={CURRENCIES} blank="-" />
            </Select>
          </Field>
          <Field id="funding_period" label="Period">
            <Select id="funding_period" name="funding_period" defaultValue={funding.period}>
              <Opts items={PERIODS} blank="-" />
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-base font-medium">Deadline and how to apply</legend>
        <div className={grid2}>
          <Field
            id="deadline_day"
            label="Closing date"
            hint="Closes at the end of that day, Harare time. Leave empty if the source gives none."
            error={e("deadline_at")}
          >
            <TextInput
              id="deadline_day"
              name="deadline_day"
              type="date"
              defaultValue={dayOf(initial.deadline_at)}
            />
          </Field>
          <Field id="reference_number" label="Reference number">
            <TextInput
              id="reference_number"
              name="reference_number"
              maxLength={100}
              defaultValue={initial.reference_number ?? ""}
            />
          </Field>
          <Field id="application_method" label="Applicants apply by" className="sm:col-span-2">
            <Select
              id="application_method"
              name="application_method"
              value={method}
              onChange={(ev) => setMethod(ev.target.value)}
            >
              <Opts items={METHODS} />
            </Select>
          </Field>
          {method === "external_url" ? (
            <Field
              id="application_url"
              label="Application web address (https)"
              className="sm:col-span-2"
              error={e("application_url")}
            >
              <TextInput
                id="application_url"
                name="application_url"
                type="url"
                defaultValue={initial.application_url ?? ""}
              />
            </Field>
          ) : null}
          {method === "email" ? (
            <Field
              id="application_email"
              label="Application e-mail address"
              className="sm:col-span-2"
              error={e("application_email")}
            >
              <TextInput
                id="application_email"
                name="application_email"
                type="email"
                defaultValue={initial.application_email ?? ""}
              />
            </Field>
          ) : null}
          {method === "instructions" ? (
            <Field
              id="application_instructions"
              label="Application instructions"
              className="sm:col-span-2"
              error={e("application_instructions")}
            >
              <Textarea
                id="application_instructions"
                name="application_instructions"
                rows={4}
                defaultValue={initial.application_instructions ?? ""}
              />
            </Field>
          ) : null}
          <Field
            id="contact_details"
            label="Contact details"
            className="sm:col-span-2"
            error={e("contact_details")}
          >
            <TextInput
              id="contact_details"
              name="contact_details"
              maxLength={500}
              defaultValue={initial.contact_details ?? ""}
            />
          </Field>
        </div>
      </fieldset>

      {category.detail_fields.length ? (
        <fieldset className={section}>
          <legend className="px-1 text-base font-medium">{category.name}: details</legend>
          <div className={grid2}>
            {category.detail_fields.map((f) => (
              <DetailInput
                key={f.name}
                field={f}
                value={initial.detail[f.name]}
                error={e(`detail.${f.name}`)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {sectors.length ? (
        <fieldset className={section}>
          <legend className="px-1 text-base font-medium">Sectors</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {sectors.map((s) => (
              <Checkbox
                key={s.id}
                id={`sector-${s.id}`}
                name="sector"
                value={s.id}
                label={s.name}
                defaultChecked={chosenSectors.has(s.id)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className={section}>
        <legend className="px-1 text-base font-medium">Sources and evidence</legend>
        <p className="m-0 text-ctl text-muted">
          Say where the information came from. At least one source is needed to submit, and one must be marked
          primary. Verification is recorded separately, by someone else.
        </p>
        {keys.map((k, position) => {
          const s = sources[k];
          return (
            <div key={k} className="grid gap-3 rounded-card border border-line p-3">
              <p className="m-0 text-ctl font-medium">Source {position + 1}</p>
              <div className={grid2}>
                <Field id={`source_${k}_kind`} label="Kind" error={e(`sources.${k}.kind`)}>
                  <Select
                    id={`source_${k}_kind`}
                    name={`source_${k}_kind`}
                    defaultValue={s?.kind ?? "issuer_website"}
                  >
                    <Opts items={SOURCE_KINDS} />
                  </Select>
                </Field>
                <Field id={`source_${k}_name`} label="Name of the source" error={e(`sources.${k}.name`)}>
                  <TextInput
                    id={`source_${k}_name`}
                    name={`source_${k}_name`}
                    maxLength={200}
                    defaultValue={s?.name ?? ""}
                  />
                </Field>
                <Field id={`source_${k}_url`} label="Web address" error={e(`sources.${k}.url`)}>
                  <TextInput id={`source_${k}_url`} name={`source_${k}_url`} defaultValue={s?.url ?? ""} />
                </Field>
                <Field
                  id={`source_${k}_observed_on`}
                  label="Checked on"
                  error={e(`sources.${k}.observed_on`)}
                >
                  <TextInput
                    id={`source_${k}_observed_on`}
                    name={`source_${k}_observed_on`}
                    type="date"
                    defaultValue={s?.observed_on ?? ""}
                  />
                </Field>
                <Field
                  id={`source_${k}_citation`}
                  label="Citation (page, notice number)"
                  className="sm:col-span-2"
                >
                  <TextInput
                    id={`source_${k}_citation`}
                    name={`source_${k}_citation`}
                    maxLength={500}
                    defaultValue={s?.citation ?? ""}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-ctl text-check-text">
                  <input
                    type="radio"
                    name="source_primary"
                    value={k}
                    defaultChecked={position === primaryIndex}
                    className="accent-accent"
                  />
                  Primary source
                </label>
                {keys.length > 1 ? (
                  <Button variant="secondary" onClick={() => setKeys(keys.filter((x) => x !== k))}>
                    Remove source {position + 1}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setKeys([...keys, nextKey]);
              setNextKey(nextKey + 1);
            }}
          >
            Add another source
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save draft"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={(ev) => {
            const form = (ev.currentTarget as HTMLButtonElement).form;
            if (form)
              void save(
                { preventDefault() {}, currentTarget: form } as React.FormEvent<HTMLFormElement>,
                true,
              );
          }}
        >
          Save and view
        </Button>
      </div>
    </form>
  );
}

function DetailInput({ field, value, error }: { field: DetailField; value: unknown; error?: string }) {
  const id = `detail_${field.name}`;
  const label = `${humanise(field.name)}${field.required ? " (required)" : ""}`;
  if (field.type === "array" && field.item_enum) {
    const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
    return (
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="text-ctl font-medium text-check-text">{label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {field.item_enum.map((v) => (
            <Checkbox
              key={v}
              id={`${id}-${v}`}
              name={id}
              value={v}
              label={humanise(v)}
              defaultChecked={chosen.has(v)}
            />
          ))}
        </div>
        {error ? (
          <p role="alert" className="m-0 text-small text-danger">
            <span className="font-strong">Error:</span> {error}
          </p>
        ) : null}
      </fieldset>
    );
  }
  if (field.type === "array")
    return (
      <Field id={id} label={label} hint="One per line." error={error} className="sm:col-span-2">
        <Textarea
          id={id}
          name={id}
          rows={3}
          defaultValue={Array.isArray(value) ? (value as string[]).join("\n") : ""}
          invalid={!!error}
        />
      </Field>
    );
  if (field.type === "boolean")
    return (
      <Field id={id} label={label} error={error}>
        <Select id={id} name={id} defaultValue={value === true ? "yes" : value === false ? "no" : ""}>
          <option value="">Not stated</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Field>
    );
  if (field.enum)
    return (
      <Field id={id} label={label} error={error}>
        <Select id={id} name={id} defaultValue={typeof value === "string" ? value : ""}>
          <option value="">Not stated</option>
          {field.enum.map((v) => (
            <option key={v} value={v}>
              {humanise(v)}
            </option>
          ))}
        </Select>
      </Field>
    );
  if (field.type === "object")
    return (
      <Field id={id} label={label} hint="JSON." error={error} className="sm:col-span-2">
        <Textarea
          id={id}
          name={id}
          rows={3}
          defaultValue={value ? JSON.stringify(value) : ""}
          invalid={!!error}
        />
      </Field>
    );
  const date = field.format === "date";
  const dateTime = field.format === "date-time";
  return (
    <Field id={id} label={label} error={error}>
      <TextInput
        id={id}
        name={id}
        type={
          date
            ? "date"
            : dateTime
              ? "datetime-local"
              : field.type === "integer" || field.type === "number"
                ? "number"
                : "text"
        }
        maxLength={field.max_length ?? undefined}
        defaultValue={
          typeof value === "string"
            ? dateTime
              ? value.slice(0, 16)
              : value
            : value === undefined || value === null
              ? ""
              : String(value)
        }
        invalid={!!error}
      />
    </Field>
  );
}
