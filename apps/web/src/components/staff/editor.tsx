"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Field, Select, Textarea, TextInput } from "@/components/ui";
import { SafeHtml } from "@/lib/safe-html";
import { apiFetch } from "@/lib/client-api";
import { dateInputValue, harareToIso, timeInputValue, words } from "@/lib/staff-format";
import type {
  CategorySchema,
  DraftContent,
  Money,
  OpportunityDetail,
  SourceInput,
  StaffReference,
} from "@/lib/staff-types";
import { ActionButton } from "./actions";
import { CategoryDetails, ChoiceSelect, OrganisationPicker, Row, Section } from "./editor-parts";
import { Notice } from "./primitives";

type Closing = { mode: "none" | "date" | "datetime"; date: string; time: string };
type OrgChoice = { id: string; name: string; verified: boolean } | null;

const EMPTY: DraftContent = {
  organisation_id: "",
  title: "",
  summary: "",
  description_md: "",
  requirements_md: null,
  locations: [],
  location_text: null,
  geographic_eligibility: null,
  work_mode: null,
  employment_type: null,
  experience_level: null,
  salary: null,
  funding: null,
  deadline_at: null,
  deadline_timezone: null,
  deadline_is_date_only: false,
  application_method: "external_url",
  application_url: null,
  application_email: null,
  application_instructions: null,
  reference_number: null,
  contact_details: null,
  skills: [],
  sector_ids: [],
  sources: [],
  detail: {},
};

const BAR_ORDER = [
  "submit",
  "publish_direct",
  "approve",
  "publish",
  "reject",
  "return",
  "verify",
  "withdraw",
  "expire",
  "takedown",
  "archive",
  "discard",
  "reopen",
  "amend",
]; // fmt: skip

const today = () => new Date().toISOString().slice(0, 10);
const blankMoney = (): Money => ({ min: "", max: "", currency: "USD", period: "month" });

function closingOf(content: DraftContent): Closing {
  if (!content.deadline_at) return { mode: "none", date: "", time: "" };
  const date = dateInputValue(content.deadline_at, content.deadline_timezone);
  return content.deadline_is_date_only
    ? { mode: "date", date, time: "" }
    : { mode: "datetime", date, time: timeInputValue(content.deadline_at, content.deadline_timezone) };
}

function moneyPayload(money: Money | null, withPeriod = true): Money | null {
  if (!money) return null;
  const min = (money.min ?? "").toString().trim();
  const max = (money.max ?? "").toString().trim();
  if (!min && !max) return null;
  return {
    min: min || null,
    max: max || null,
    currency: money.currency,
    period: withPeriod ? money.period : null,
  };
}

const nul = (value: string | null | undefined) => (value && value.trim() ? value : null);

/** Everything the editor manages, in the shape the API expects. Skills are left untouched (not sent). */
function payload(
  content: DraftContent,
  closing: Closing,
  schema: CategorySchema | null,
): Record<string, unknown> {
  const a = schema?.applicable;
  let deadline: Pick<DraftContent, "deadline_at" | "deadline_timezone" | "deadline_is_date_only">;
  if (closing.mode === "none" || !closing.date) {
    deadline = { deadline_at: null, deadline_timezone: null, deadline_is_date_only: false };
  } else if (closing.mode === "date") {
    deadline = {
      deadline_at: harareToIso(closing.date, ""),
      deadline_timezone: "Africa/Harare",
      deadline_is_date_only: true,
    };
  } else {
    deadline = {
      deadline_at: harareToIso(closing.date, closing.time || "17:00"),
      deadline_timezone: "Africa/Harare",
      deadline_is_date_only: false,
    };
  }
  return {
    organisation_id: content.organisation_id || undefined,
    title: content.title,
    summary: content.summary,
    description_md: content.description_md,
    requirements_md: nul(content.requirements_md),
    locations: content.locations.map((l) => ({ location_id: l.location_id, is_primary: l.is_primary })),
    location_text: nul(content.location_text),
    geographic_eligibility: nul(content.geographic_eligibility),
    work_mode: a?.work_mode === false ? null : content.work_mode,
    employment_type: a && a.employment_types === null ? null : content.employment_type,
    experience_level: a?.experience_level === false ? null : content.experience_level,
    salary: a?.salary === false ? null : moneyPayload(content.salary),
    funding: a?.funding === false ? null : moneyPayload(content.funding),
    ...deadline,
    application_method: content.application_method,
    application_url: content.application_method === "external_url" ? nul(content.application_url) : null,
    application_email: content.application_method === "email" ? nul(content.application_email) : null,
    application_instructions: nul(content.application_instructions),
    reference_number: nul(content.reference_number),
    contact_details: nul(content.contact_details),
    sector_ids: content.sector_ids,
    sources: content.sources.map((s) => ({
      kind: s.kind,
      name: s.name,
      url: nul(s.url),
      citation: nul(s.citation),
      observed_on: s.observed_on,
      is_primary: s.is_primary,
    })),
    detail: content.detail,
  };
}

type Props = {
  reference: StaffReference;
  /** Open the "Publish now" dialog on arrival (set after "Save and publish"). */
  autoPublish?: boolean;
  permissions: string[];
  /** Present when editing an existing draft (or viewing a listing that cannot be edited). */
  initial?: OpportunityDetail;
  initialOrganisation?: OrgChoice;
};

export function OpportunityEditor({
  reference,
  permissions,
  initial,
  initialOrganisation,
  autoPublish,
}: Props) {
  const router = useRouter();
  const editing = Boolean(initial);
  const readOnly = Boolean(initial) && !initial!.actions.includes("edit");
  const [category, setCategory] = useState(initial?.category.code ?? "");
  const [content, setContent] = useState<DraftContent>(() => {
    if (!initial) return EMPTY;
    const c = initial.content;
    return {
      ...c,
      salary: c.salary ?? null,
      funding: c.funding ?? null,
      sources: c.sources.length ? c.sources : [],
    };
  });
  const [closing, setClosing] = useState<Closing>(() => closingOf(initial?.content ?? EMPTY));
  const [org, setOrg] = useState<OrgChoice>(initialOrganisation ?? null);
  const [schema, setSchema] = useState<CategorySchema | null>(null);
  // The version the server last confirmed to this page: after a save it is ahead of the props until the refresh lands.
  const [savedVersion, setSavedVersion] = useState(0);
  const rowVersion = Math.max(savedVersion, initial?.row_version ?? 0);
  const [busy, setBusy] = useState<"save" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [preview, setPreview] = useState<{
    description_html: string | null;
    requirements_html: string | null;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const publishSignal = autoPublish ? 1 : 0;
  const [dirty, setDirty] = useState(false);

  const can = (permission: string) => permissions.includes(permission);

  useEffect(() => {
    if (!category) return;
    let live = true;
    apiFetch<CategorySchema>("GET", `staff/categories/${category}/schema`).then((r) => {
      if (live && r.ok) setSchema(r.data);
    });
    return () => {
      live = false;
    };
  }, [category]);

  const a = category ? schema?.applicable : undefined;
  const set = <K extends keyof DraftContent>(key: K, value: DraftContent[K]) => {
    setDirty(true);
    setContent((c) => ({ ...c, [key]: value }));
  };
  const updateClosing = (next: Closing) => {
    setDirty(true);
    setClosing(next);
  };
  const err = (key: string) => errors[key]?.[0];

  const errorList = useMemo(() => Object.entries(errors).filter(([, messages]) => messages.length), [errors]);

  function showErrors(fields: Record<string, string[]>, text: string) {
    setErrors(fields);
    setNotice({ tone: "error", text });
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function save(thenPublish = false): Promise<boolean> {
    if (!org && !content.organisation_id) {
      showErrors(
        { organisation_id: ["Choose or enter an organisation."] },
        "The draft needs an organisation first.",
      );
      return false;
    }
    if (!editing && !category) {
      showErrors({ category: ["Choose a category."] }, "Choose a category first.");
      return false;
    }
    setBusy("save");
    setNotice(null);
    setErrors({});
    const body = payload(
      { ...content, organisation_id: org?.id ?? content.organisation_id },
      closing,
      schema,
    );
    const result = editing
      ? await apiFetch<OpportunityDetail>("PATCH", `staff/opportunities/${initial!.id}`, {
          row_version: rowVersion,
          content: body,
        })
      : await apiFetch<OpportunityDetail>("POST", "staff/opportunities/new", { category, content: body });
    setBusy(null);
    if (!result.ok) {
      showErrors(result.fields, result.message);
      return false;
    }
    setSavedVersion(result.data.row_version);
    setDirty(false);
    setNotice({ tone: "success", text: "Draft saved." });
    if (!editing) router.replace(`/staff/opportunities/${result.data.id}${thenPublish ? "?publish=1" : ""}`);
    else router.refresh();
    return true;
  }

  async function runPreview() {
    setPreviewing(true);
    const result = await apiFetch<{ description_html: string | null; requirements_html: string | null }>(
      "POST",
      "staff/preview",
      { description_md: content.description_md, requirements_md: nul(content.requirements_md) },
    );
    setPreviewing(false);
    if (!result.ok) return showErrors(result.fields, result.message);
    setPreview(result.data);
    requestAnimationFrame(() => document.getElementById("preview")?.scrollIntoView({ behavior: "smooth" }));
  }

  const toggleLocation = (id: string, name: string) => {
    const has = content.locations.some((l) => l.location_id === id);
    const next = has
      ? content.locations.filter((l) => l.location_id !== id)
      : [...content.locations, { location_id: id, name, is_primary: content.locations.length === 0 }];
    if (next.length && !next.some((l) => l.is_primary)) next[0] = { ...next[0]!, is_primary: true };
    set("locations", next.slice(0, 5));
  };
  const locationList = reference.locations.filter((l) =>
    l.name.toLowerCase().includes(locationFilter.toLowerCase()),
  );
  const setSource = (index: number, patch: Partial<SourceInput>) =>
    set(
      "sources",
      content.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  const employmentChoices = reference.choices.employment_type.filter(
    (c) => !a?.employment_types || a.employment_types.includes(c.value),
  );

  const dis = readOnly ? { disabled: true } : {};
  const barActions = initial
    ? [...initial.actions.filter((x) => x !== "edit"), ...(initial.verification.can_record ? ["verify"] : [])]
    : [];

  return (
    <>
      <form
        id="opportunity-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid gap-5 pb-28"
        noValidate
      >
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          {notice ? (
            <Notice tone={notice.tone === "error" ? "error" : "success"}>
              {notice.text}
              {notice.tone === "error" && errorList.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {errorList.slice(0, 12).map(([field, messages]) => (
                    <li key={field}>
                      {words(field.replace(/\.\d+/g, ""))}: {messages[0]}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          ) : null}
        </div>
        {readOnly ? (
          <Notice>
            This revision is not an editable draft for you. You can read it, preview it and use the actions on
            the right.
          </Notice>
        ) : null}

        <Section id="organisation" title="1. Organisation" hint="Who is offering this opportunity?">
          {readOnly ? (
            <p className="text-ctl">{org?.name ?? initial?.organisation.name}</p>
          ) : (
            <OrganisationPicker
              value={
                org ??
                (initial
                  ? {
                      id: initial.organisation.id,
                      name: initial.organisation.name,
                      verified: initial.organisation.verified,
                    }
                  : null)
              }
              onChange={(o) => {
                setDirty(true);
                setOrg(o);
                if (o) set("organisation_id", o.id);
              }}
              canCreate={can("org.create")}
              error={err("organisation_id")}
            />
          )}
        </Section>

        <Section id="basics" title="2. Title and category">
          <Row>
            <Field
              id="title"
              label="Job title"
              error={err("title")}
              hint="5 to 200 characters. Not all capitals, no web address."
            >
              <TextInput
                id="title"
                value={content.title}
                invalid={Boolean(err("title"))}
                maxLength={200}
                onChange={(e) => set("title", e.target.value)}
                {...dis}
              />
            </Field>
            {editing ? (
              <Field id="category" label="Category" hint="Fixed once the draft exists.">
                <TextInput id="category" value={initial!.category.name} readOnly />
              </Field>
            ) : (
              <Field
                id="category"
                label="Category"
                error={err("category")}
                hint="Fixed once the draft exists."
              >
                <Select
                  id="category"
                  value={category}
                  invalid={Boolean(err("category"))}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Choose a category</option>
                  {reference.categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Row>
          <Field
            id="summary"
            label="Summary"
            error={err("summary")}
            hint={`${content.summary.length}/300. One or two sentences shown in search results (20 to 300 characters).`}
          >
            <Textarea
              id="summary"
              rows={2}
              value={content.summary}
              invalid={Boolean(err("summary"))}
              maxLength={300}
              onChange={(e) => set("summary", e.target.value)}
              {...dis}
            />
          </Field>
          <Row>
            <Field id="reference" label="Reference number (optional)" error={err("reference_number")}>
              <TextInput
                id="reference"
                value={content.reference_number ?? ""}
                maxLength={100}
                onChange={(e) => set("reference_number", e.target.value)}
                {...dis}
              />
            </Field>
          </Row>
        </Section>

        <Section
          id="where"
          title="3. Location and employment"
          hint="Choose up to five places and mark one as primary."
        >
          <Field id="loc-filter" label="Find a place">
            <TextInput
              id="loc-filter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-ctl font-medium text-check-text">Locations</legend>
            <div className="grid max-h-[180px] grid-cols-3 gap-x-4 gap-y-1 overflow-y-auto rounded-control border border-line p-3 max-md:grid-cols-2 max-sm:grid-cols-1">
              {locationList.map((l) => (
                <Checkbox
                  key={l.id}
                  id={`loc-${l.id}`}
                  label={l.name}
                  checked={content.locations.some((x) => x.location_id === l.id)}
                  onChange={() => toggleLocation(l.id, l.name)}
                  disabled={readOnly}
                />
              ))}
            </div>
            {content.locations.length ? (
              <div
                role="radiogroup"
                aria-label="Primary location"
                className="flex flex-wrap gap-x-5 gap-y-1 text-ctl"
              >
                {content.locations.map((l) => {
                  const name =
                    l.name ?? reference.locations.find((x) => x.id === l.location_id)?.name ?? "Location";
                  return (
                    <label key={l.location_id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="primary-location"
                        checked={l.is_primary}
                        disabled={readOnly}
                        onChange={() =>
                          set(
                            "locations",
                            content.locations.map((x) => ({
                              ...x,
                              is_primary: x.location_id === l.location_id,
                            })),
                          )
                        }
                      />
                      {name} <span className="text-small text-muted">primary</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            {err("locations") ? (
              <p role="alert" className="text-small text-danger">
                <span className="font-strong">Error:</span> {err("locations")}
              </p>
            ) : null}
          </fieldset>
          <Row cols={3}>
            <Field
              id="location-text"
              label="Place as advertised (optional)"
              error={err("location_text")}
              hint="For example “Head office, Harare”."
            >
              <TextInput
                id="location-text"
                value={content.location_text ?? ""}
                maxLength={200}
                onChange={(e) => set("location_text", e.target.value)}
                {...dis}
              />
            </Field>
            {a?.work_mode !== false ? (
              <ChoiceSelect
                id="work-mode"
                label="Work mode"
                value={content.work_mode}
                onChange={(v) => set("work_mode", v)}
                choices={reference.choices.work_mode}
                error={err("work_mode")}
              />
            ) : null}
            {a?.employment_types !== null ? (
              <ChoiceSelect
                id="employment"
                label="Employment type"
                value={content.employment_type}
                onChange={(v) => set("employment_type", v)}
                choices={employmentChoices}
                blank="Choose a type"
                error={err("employment_type")}
              />
            ) : null}
          </Row>
          {category === "scholarships" || category === "grants" ? (
            <Field
              id="geo"
              label="Who may apply from where"
              error={err("geographic_eligibility")}
              hint="Required reading for reviewers: state the eligible countries or regions."
            >
              <TextInput
                id="geo"
                value={content.geographic_eligibility ?? ""}
                maxLength={500}
                onChange={(e) => set("geographic_eligibility", e.target.value)}
                {...dis}
              />
            </Field>
          ) : null}
        </Section>

        <Section
          id="text"
          title="4. Description, responsibilities and requirements"
          hint="Markdown subset: ### headings, - lists, **bold**, *italic*, [links](https://…). No HTML, images or tables."
        >
          <Field
            id="description"
            label="Description and responsibilities"
            error={err("description_md")}
            hint={`${content.description_md.length}/20000 characters (at least 50). Put the duties under a “### Responsibilities” heading.`}
          >
            <Textarea
              id="description"
              rows={10}
              value={content.description_md}
              invalid={Boolean(err("description_md"))}
              onChange={(e) => set("description_md", e.target.value)}
              {...dis}
            />
          </Field>
          <Field
            id="requirements"
            label="Requirements (optional)"
            error={err("requirements_md")}
            hint="Skills, qualifications and conditions applicants must meet."
          >
            <Textarea
              id="requirements"
              rows={6}
              value={content.requirements_md ?? ""}
              onChange={(e) => set("requirements_md", e.target.value)}
              {...dis}
            />
          </Field>
          {a?.experience_level !== false ? (
            <Row>
              <ChoiceSelect
                id="experience"
                label="Experience level"
                value={content.experience_level}
                onChange={(v) => set("experience_level", v)}
                choices={reference.choices.experience_level}
                error={err("experience_level")}
              />
            </Row>
          ) : null}
        </Section>

        {schema && Object.keys(schema.properties).length ? (
          <Section
            id="details"
            title="5. Qualifications, experience and category details"
            hint={`Fields specific to ${initial?.category.name ?? reference.categories.find((c) => c.code === category)?.name ?? "this category"}. Leave blank what is not stated by the issuer.`}
          >
            <fieldset disabled={readOnly} className="contents">
              <CategoryDetails
                schema={schema}
                value={content.detail}
                onChange={(d) => set("detail", d)}
                errors={errors}
              />
            </fieldset>
          </Section>
        ) : null}

        {a?.salary !== false || a?.funding !== false ? (
          <Section
            id="money"
            title={a?.funding === false || a?.funding === undefined ? "6. Salary" : "6. Funding"}
            hint="Only what the issuer states. Amounts are never converted or estimated."
          >
            {(() => {
              const key = a?.salary === false ? "funding" : "salary";
              const money = content[key] ?? null;
              const update = (patch: Partial<Money>) => set(key, { ...(money ?? blankMoney()), ...patch });
              return (
                <Row cols={4}>
                  <Field id="m-min" label="Minimum" error={err(`${key}.min`) ?? err(key)}>
                    <TextInput
                      id="m-min"
                      inputMode="decimal"
                      value={money?.min ?? ""}
                      onChange={(e) => update({ min: e.target.value })}
                      {...dis}
                    />
                  </Field>
                  <Field id="m-max" label="Maximum" error={err(`${key}.max`)}>
                    <TextInput
                      id="m-max"
                      inputMode="decimal"
                      value={money?.max ?? ""}
                      onChange={(e) => update({ max: e.target.value })}
                      {...dis}
                    />
                  </Field>
                  <Field id="m-cur" label="Currency">
                    <Select
                      id="m-cur"
                      value={money?.currency ?? "USD"}
                      onChange={(e) => update({ currency: e.target.value })}
                      {...dis}
                    >
                      {reference.currencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="m-per" label="Period">
                    <Select
                      id="m-per"
                      value={money?.period ?? "month"}
                      onChange={(e) => update({ period: e.target.value })}
                      {...dis}
                    >
                      {reference.choices.salary_period.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </Row>
              );
            })()}
          </Section>
        ) : null}

        <Section
          id="apply"
          title="7. How to apply"
          hint="UPNEXT never receives applications: people apply with the issuer."
        >
          <Row>
            <ChoiceSelect
              id="method"
              label="Application method"
              value={content.application_method}
              onChange={(v) => set("application_method", v ?? "external_url")}
              choices={reference.choices.application_method}
              blank={null}
            />
            {content.application_method === "external_url" ? (
              <Field
                id="app-url"
                label="Application web address"
                error={err("application_url")}
                hint="https only; tracking parameters are removed."
              >
                <TextInput
                  id="app-url"
                  type="url"
                  placeholder="https://"
                  value={content.application_url ?? ""}
                  invalid={Boolean(err("application_url"))}
                  onChange={(e) => set("application_url", e.target.value)}
                  {...dis}
                />
              </Field>
            ) : null}
            {content.application_method === "email" ? (
              <Field id="app-email" label="Application e-mail" error={err("application_email")}>
                <TextInput
                  id="app-email"
                  type="email"
                  value={content.application_email ?? ""}
                  invalid={Boolean(err("application_email"))}
                  onChange={(e) => set("application_email", e.target.value)}
                  {...dis}
                />
              </Field>
            ) : null}
          </Row>
          <Field
            id="app-instr"
            label={
              content.application_method === "instructions"
                ? "Application instructions"
                : "Extra instructions (optional)"
            }
            error={err("application_instructions")}
            hint="At least 20 characters when instructions are the method."
          >
            <Textarea
              id="app-instr"
              rows={3}
              value={content.application_instructions ?? ""}
              invalid={Boolean(err("application_instructions"))}
              maxLength={2000}
              onChange={(e) => set("application_instructions", e.target.value)}
              {...dis}
            />
          </Field>
          <Field id="contact" label="Contact details (optional)" error={err("contact_details")}>
            <TextInput
              id="contact"
              value={content.contact_details ?? ""}
              maxLength={500}
              onChange={(e) => set("contact_details", e.target.value)}
              {...dis}
            />
          </Field>
        </Section>

        <Section
          id="closing"
          title="8. Closing date"
          hint="Times are Africa/Harare. A date alone means the end of that day."
        >
          <Row cols={3}>
            <Field id="close-mode" label="Closing" error={err("deadline_at")}>
              <Select
                id="close-mode"
                value={closing.mode}
                onChange={(e) => updateClosing({ ...closing, mode: e.target.value as Closing["mode"] })}
                {...dis}
              >
                <option value="none">Not stated by the issuer</option>
                <option value="date">A closing date (end of day)</option>
                <option value="datetime">A date and time</option>
              </Select>
            </Field>
            {closing.mode !== "none" ? (
              <Field id="close-date" label="Date" error={err("deadline_at")}>
                <TextInput
                  id="close-date"
                  type="date"
                  value={closing.date}
                  min={today()}
                  onChange={(e) => updateClosing({ ...closing, date: e.target.value })}
                  {...dis}
                />
              </Field>
            ) : null}
            {closing.mode === "datetime" ? (
              <Field id="close-time" label="Time">
                <TextInput
                  id="close-time"
                  type="time"
                  value={closing.time}
                  onChange={(e) => updateClosing({ ...closing, time: e.target.value })}
                  {...dis}
                />
              </Field>
            ) : null}
          </Row>
          {a?.deadline_required ? (
            <p className="text-small text-muted">A closing time is required for this category.</p>
          ) : null}
        </Section>

        <Section
          id="sources"
          title="9. Original source and verification"
          hint="Where did this information come from? At least one source, exactly one primary. A source is not a verification: verification is recorded afterwards by someone who did not write the listing."
        >
          {err("sources") ? (
            <p role="alert" className="text-small text-danger">
              <span className="font-strong">Error:</span> {err("sources")}
            </p>
          ) : null}
          {content.sources.map((s, i) => (
            <fieldset key={i} className="grid gap-3 rounded-card border border-line p-3">
              <legend className="px-1 text-ctl text-check-text">Source {i + 1}</legend>
              <Row cols={3}>
                <ChoiceSelect
                  id={`s-kind-${i}`}
                  label="Kind"
                  value={s.kind}
                  onChange={(v) => setSource(i, { kind: v ?? "other" })}
                  choices={reference.choices.source_kind}
                  blank={null}
                  error={err(`sources.${i}.kind`)}
                />
                <Field
                  id={`s-name-${i}`}
                  label="Name"
                  error={err(`sources.${i}.name`)}
                  hint="For example “Ministry of Finance website”."
                >
                  <TextInput
                    id={`s-name-${i}`}
                    value={s.name}
                    maxLength={200}
                    onChange={(e) => setSource(i, { name: e.target.value })}
                    {...dis}
                  />
                </Field>
                <Field id={`s-date-${i}`} label="Checked on" error={err(`sources.${i}.observed_on`)}>
                  <TextInput
                    id={`s-date-${i}`}
                    type="date"
                    value={s.observed_on}
                    max={today()}
                    onChange={(e) => setSource(i, { observed_on: e.target.value })}
                    {...dis}
                  />
                </Field>
              </Row>
              <Row>
                <Field
                  id={`s-url-${i}`}
                  label="Web address"
                  error={err(`sources.${i}.url`)}
                  hint="https only."
                >
                  <TextInput
                    id={`s-url-${i}`}
                    type="url"
                    placeholder="https://"
                    value={s.url ?? ""}
                    onChange={(e) => setSource(i, { url: e.target.value })}
                    {...dis}
                  />
                </Field>
                <Field
                  id={`s-cite-${i}`}
                  label="Citation (when there is no web address)"
                  error={err(`sources.${i}`)}
                  hint="Newspaper, date and page, or the notice reference."
                >
                  <TextInput
                    id={`s-cite-${i}`}
                    value={s.citation ?? ""}
                    maxLength={500}
                    onChange={(e) => setSource(i, { citation: e.target.value })}
                    {...dis}
                  />
                </Field>
              </Row>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-ctl">
                  <input
                    type="radio"
                    name="primary-source"
                    checked={s.is_primary}
                    disabled={readOnly}
                    onChange={() =>
                      set(
                        "sources",
                        content.sources.map((x, j) => ({ ...x, is_primary: j === i })),
                      )
                    }
                  />
                  Primary source
                </label>
                {!readOnly ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const rest = content.sources.filter((_, j) => j !== i);
                      if (s.is_primary && rest[0]) rest[0] = { ...rest[0], is_primary: true };
                      set("sources", rest);
                    }}
                  >
                    Remove source {i + 1}
                  </Button>
                ) : null}
              </div>
            </fieldset>
          ))}
          {!readOnly && content.sources.length < 10 ? (
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  set("sources", [
                    ...content.sources,
                    {
                      kind: "issuer_website",
                      name: "",
                      url: null,
                      citation: null,
                      observed_on: today(),
                      is_primary: content.sources.length === 0,
                    },
                  ])
                }
              >
                Add a source
              </Button>
            </div>
          ) : null}
          {initial ? (
            <div className="rounded-card border border-line bg-(--staff-canvas) p-3 text-ctl">
              <p>
                Verification level:{" "}
                <strong className="font-medium">{words(initial.verification.level)}</strong>
                {initial.verification.level === "not_verified"
                  ? " - publishing never verifies a listing."
                  : null}
              </p>
              {initial.verification.records.length ? (
                <ul className="mt-2 grid gap-1 text-small text-muted">
                  {initial.verification.records.map((r) => (
                    <li key={r.id}>
                      {words(r.level)} · {words(r.method)} · {words(r.outcome)} by {r.checked_by?.name}{" "}
                      (revision {r.version_no})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Section>

        {reference.sectors.length ? (
          <Section id="sectors" title="10. Sectors (optional)" hint="Up to five.">
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 max-md:grid-cols-2 max-sm:grid-cols-1">
              {reference.sectors.map((s) => (
                <Checkbox
                  key={s.id}
                  id={`sector-${s.id}`}
                  label={s.name}
                  checked={content.sector_ids.includes(s.id)}
                  disabled={readOnly}
                  onChange={(e) =>
                    set(
                      "sector_ids",
                      e.target.checked
                        ? [...content.sector_ids, s.id].slice(0, 5)
                        : content.sector_ids.filter((x) => x !== s.id),
                    )
                  }
                />
              ))}
            </div>
            {err("sector_ids") ? (
              <p role="alert" className="text-small text-danger">
                {err("sector_ids")}
              </p>
            ) : null}
          </Section>
        ) : null}

        {preview ? (
          <section
            id="preview"
            aria-labelledby="preview-h"
            className="scroll-mt-24 rounded-card border border-border-interest bg-(--staff-card) p-5 shadow-subtle max-sm:p-4"
          >
            <h2 id="preview-h" className="text-lead tracking-title">
              Preview
            </h2>
            <p className="mb-3 text-small text-muted">
              How the text will read on the public listing. Nothing is published by previewing.
            </p>
            <article className="grid gap-1">
              <h3 className="text-sub tracking-sub">{content.title || "Untitled"}</h3>
              <p className="text-ctl text-muted">
                {org?.name ?? initial?.organisation.name ?? "Organisation"}
                {content.location_text ? ` · ${content.location_text}` : ""}
                {closing.mode !== "none" && closing.date
                  ? ` · Closes ${closing.date}${closing.mode === "datetime" && closing.time ? ` ${closing.time}` : ""}`
                  : ""}
              </p>
              <p className="mt-2 text-ctl">{content.summary}</p>
              {preview.description_html ? <SafeHtml html={preview.description_html} /> : null}
              {preview.requirements_html ? (
                <>
                  <h4 className="mt-5 text-title">Requirements</h4>
                  <SafeHtml html={preview.requirements_html} />
                </>
              ) : null}
            </article>
          </section>
        ) : null}
      </form>
      {/* Sticky action bar: save, preview, then every workflow action that applies to this revision right now. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:left-[256px]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-end gap-2 px-4 py-3 md:px-8">
          {dirty ? (
            <span role="status" className="mr-auto text-small text-muted">
              Unsaved changes: save the draft before submitting or publishing.
            </span>
          ) : null}
          <Button variant="secondary" onClick={() => void runPreview()} disabled={previewing}>
            {previewing ? "Rendering…" : "Preview"}
          </Button>
          {!readOnly ? (
            <Button variant="secondary" type="submit" form="opportunity-editor" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
          ) : null}
          {!editing && can("opp.publish_direct") ? (
            <Button disabled={busy === "save"} onClick={() => void save(true)}>
              Save and publish…
            </Button>
          ) : null}
          {initial
            ? BAR_ORDER.filter((name) => barActions.includes(name)).map((name) => (
                <ActionButton
                  key={name}
                  opportunityId={initial.id}
                  rowVersion={rowVersion}
                  action={name}
                  afterTo="/staff/opportunities"
                  disabled={dirty && (name === "submit" || name === "publish_direct")}
                  openSignal={name === "publish_direct" ? publishSignal : 0}
                  verifyChoices={{
                    level: reference.choices.verification_level,
                    method: reference.choices.verification_method,
                    outcome: reference.choices.verification_outcome,
                  }}
                />
              ))
            : null}
        </div>
      </div>
    </>
  );
}
