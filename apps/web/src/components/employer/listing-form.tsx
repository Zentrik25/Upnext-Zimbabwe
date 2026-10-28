"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Select, Textarea, TextInput } from "@/components/ui";
import { FormError, FormSuccess } from "@/components/account/parts";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { EMPLOYER_CATEGORIES, type EmployerListingDetail, type ListingContent } from "@/lib/employer-types";

type LocationOption = { id: string; name: string };

const EMPLOYMENT: Record<string, [string, string][]> = {
  jobs: [
    ["permanent", "Permanent"],
    ["contract", "Contract"],
    ["temporary", "Temporary"],
    ["part_time", "Part time"],
  ],
  internships: [["internship", "Internship"]],
  "graduate-programmes": [["trainee", "Trainee programme"]],
};
const WORK_MODES: [string, string][] = [
  ["on_site", "On site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
];
const EXPERIENCE: [string, string][] = [
  ["none", "No experience needed"],
  ["entry", "Entry level"],
  ["mid", "Mid level"],
  ["senior", "Senior"],
  ["executive", "Executive"],
];
const PERIODS: [string, string][] = [
  ["month", "per month"],
  ["year", "per year"],
  ["day", "per day"],
  ["hour", "per hour"],
  ["once", "one-off"],
];
const QUALIFICATIONS: [string, string][] = [
  ["o_level", "O level"],
  ["a_level", "A level"],
  ["certificate", "Certificate"],
  ["diploma", "Diploma"],
  ["bachelors_degree", "Bachelor's degree"],
  ["honours_degree", "Honours degree"],
  ["masters_degree", "Master's degree"],
  ["doctorate", "Doctorate"],
  ["professional_qualification", "Professional qualification"],
  ["not_stated", "Not stated"],
];
const PLACEMENTS: [string, string][] = [
  ["industrial_attachment", "Industrial attachment"],
  ["internship", "Internship"],
  ["practicum", "Practicum"],
  ["apprenticeship", "Apprenticeship"],
];

/** The calendar day of an end-of-day Harare deadline (Harare is UTC+2 all year). */
function dayOf(content: ListingContent | undefined): string {
  if (!content?.deadline_at) return "";
  const shifted = new Date(new Date(content.deadline_at).getTime() + 2 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function orNull(value: string): string | null {
  return value === "" ? null : value;
}

/** The request body for a draft (exported for tests). Empty optional fields are sent as null. */
export function buildContent(form: FormData, category: string): Record<string, unknown> {
  const min = text(form, "salary_min");
  const max = text(form, "salary_max");
  const day = text(form, "deadline_day");
  const method = text(form, "application_method");
  const detail: Record<string, unknown> = {};
  const vacancies = text(form, "vacancies");
  if (vacancies) detail.vacancies = Number(vacancies);
  if (category === "jobs" && text(form, "minimum_qualification"))
    detail.minimum_qualification = text(form, "minimum_qualification");
  if (category === "internships") {
    if (text(form, "placement_type")) detail.placement_type = text(form, "placement_type");
    if (text(form, "duration_months")) detail.duration_months = Number(text(form, "duration_months"));
  }
  if (category === "graduate-programmes" && text(form, "programme_length_months"))
    detail.programme_length_months = Number(text(form, "programme_length_months"));
  const location = text(form, "location_id");
  return {
    title: text(form, "title"),
    summary: text(form, "summary"),
    description_md: text(form, "description_md"),
    requirements_md: orNull(text(form, "requirements_md")),
    locations: location ? [{ location_id: location, is_primary: true }] : [],
    location_text: orNull(text(form, "location_text")),
    work_mode: orNull(text(form, "work_mode")),
    employment_type: orNull(text(form, "employment_type")),
    experience_level: orNull(text(form, "experience_level")),
    salary:
      min || max
        ? {
            min: orNull(min),
            max: orNull(max),
            currency: orNull(text(form, "salary_currency")),
            period: orNull(text(form, "salary_period")),
          }
        : null,
    deadline_at: day ? `${day}T23:59:59+02:00` : null,
    deadline_timezone: day ? "Africa/Harare" : null,
    deadline_is_date_only: Boolean(day),
    application_method: method,
    application_url: method === "external_url" ? orNull(text(form, "application_url")) : null,
    application_email: method === "email" ? orNull(text(form, "application_email")) : null,
    application_instructions:
      method === "instructions" ? orNull(text(form, "application_instructions")) : null,
    reference_number: orNull(text(form, "reference_number")),
    detail,
  };
}

type Trigger = { preventDefault(): void; currentTarget: HTMLFormElement | HTMLButtonElement };

type Props = {
  organisationId: string;
  locations: LocationOption[];
  /** Present when editing an existing draft. */
  listing?: EmployerListingDetail;
};

export function ListingForm({ organisationId, locations, listing }: Props) {
  const router = useRouter();
  const content = listing?.content;
  const [category, setCategory] = useState(listing?.category.code ?? "jobs");
  const [method, setMethod] = useState(content?.application_method ?? "external_url");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const detail = (content?.detail ?? {}) as Record<string, string | number | undefined>;
  const e = (key: string) => errors[key]?.[0];

  async function run(event: Trigger, thenSubmit: boolean) {
    event.preventDefault();
    const origin = event.currentTarget;
    const formElement = origin instanceof HTMLFormElement ? origin : origin.form;
    if (!formElement) return;
    const form = new FormData(formElement);
    setBusy(true);
    setErrors({});
    setFailure(null);
    setSaved(false);
    const body = buildContent(form, category);
    let id = listing?.id;
    let rowVersion = listing?.row_version ?? 0;
    const first = listing
      ? await apiFetch<EmployerListingDetail>("PATCH", `employer/listings/${listing.id}`, {
          row_version: rowVersion,
          content: body,
        })
      : await apiFetch<EmployerListingDetail>("POST", `employer/organisations/${organisationId}/listings`, {
          category,
          content: body,
        });
    if (!first.ok) {
      setBusy(false);
      if (first.code === "validation_failed") setErrors(first.fields);
      else setFailure(describeFailure(first));
      return;
    }
    id = first.data.id;
    rowVersion = first.data.row_version;
    if (thenSubmit) {
      const sent = await apiFetch<EmployerListingDetail>("POST", `employer/listings/${id}/submit`, {
        row_version: rowVersion,
      });
      if (!sent.ok) {
        setBusy(false);
        if (sent.code === "validation_failed" || sent.code === "duplicate_detected") {
          setErrors(sent.fields);
          setFailure("The draft was saved, but it is not ready to submit yet. Fix the points below.");
        } else setFailure(describeFailure(sent));
        router.replace(`/employer/listings/${id}`);
        return;
      }
    }
    setBusy(false);
    if (!listing || thenSubmit) {
      router.push(`/employer/listings/${id}`);
      router.refresh();
    } else {
      setSaved(true);
      router.refresh();
    }
  }

  const flat = Object.entries(errors).filter(
    ([key]) => !["title", "summary", "description_md"].includes(key),
  );

  return (
    <form
      className="grid gap-4"
      data-testid="listing-form"
      onSubmit={(event) => run(event, false)}
      noValidate
    >
      {failure ? <FormError>{failure}</FormError> : null}
      {flat.length > 0 ? (
        <div
          role="alert"
          className="border border-urgent p-[10px] text-base text-urgent"
          data-testid="listing-errors"
        >
          <p className="font-strong">Check these points:</p>
          <ul className="m-0 list-disc pl-5">
            {flat.map(([key, messages]) => (
              <li key={key}>
                {key.replaceAll("_", " ")}: {messages[0]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {saved ? <FormSuccess>Draft saved.</FormSuccess> : null}

      {!listing ? (
        <Field id="category" label="What are you posting?">
          <Select
            id="category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {EMPLOYER_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-base">
          <span className="text-small text-muted">Type</span>
          <br />
          {listing.category.name}
        </p>
      )}

      <Field
        id="title"
        label="Title"
        hint="At least 5 characters. Not all capitals, no web addresses."
        error={e("title")}
      >
        <TextInput
          id="title"
          name="title"
          maxLength={200}
          defaultValue={content?.title ?? ""}
          invalid={Boolean(e("title"))}
        />
      </Field>
      <Field
        id="summary"
        label="Short summary"
        hint="20 to 300 characters. Shown in search results."
        error={e("summary")}
      >
        <Textarea
          id="summary"
          name="summary"
          rows={3}
          maxLength={300}
          defaultValue={content?.summary ?? ""}
          invalid={Boolean(e("summary"))}
        />
      </Field>
      <Field
        id="description_md"
        label="Description"
        hint="At least 50 characters. Plain paragraphs and simple lists. Applicants must never be asked to pay."
        error={e("description_md")}
      >
        <Textarea
          id="description_md"
          name="description_md"
          rows={10}
          maxLength={20000}
          defaultValue={content?.description_md ?? ""}
          invalid={Boolean(e("description_md"))}
        />
      </Field>
      <Field id="requirements_md" label="Requirements (optional)">
        <Textarea
          id="requirements_md"
          name="requirements_md"
          rows={5}
          maxLength={10000}
          defaultValue={content?.requirements_md ?? ""}
        />
      </Field>

      <Field id="location_id" label="Location" error={e("locations")}>
        <Select
          id="location_id"
          name="location_id"
          defaultValue={content?.locations.find((l) => l.is_primary)?.location_id ?? ""}
          invalid={Boolean(e("locations"))}
        >
          <option value="">Choose a location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="location_text"
        label="Location details (optional)"
        hint="For example: head office, with site travel."
      >
        <TextInput
          id="location_text"
          name="location_text"
          maxLength={200}
          defaultValue={content?.location_text ?? ""}
        />
      </Field>
      <Field id="employment_type" label="Employment type" error={e("employment_type")}>
        <Select
          id="employment_type"
          name="employment_type"
          defaultValue={content?.employment_type ?? ""}
          key={category}
          invalid={Boolean(e("employment_type"))}
        >
          <option value="">Choose</option>
          {(EMPLOYMENT[category] ?? []).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="work_mode" label="Where the work is done (optional)">
        <Select id="work_mode" name="work_mode" defaultValue={content?.work_mode ?? ""}>
          <option value="">Not stated</option>
          {WORK_MODES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="experience_level" label="Experience (optional)">
        <Select id="experience_level" name="experience_level" defaultValue={content?.experience_level ?? ""}>
          <option value="">Not stated</option>
          {EXPERIENCE.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="grid gap-3 rounded-card border border-border-panel p-3">
        <legend className="px-1 text-small font-strong">Pay (optional)</legend>
        <p className="text-small text-muted">
          Give both the currency and the period when you state an amount.
        </p>
        <Field id="salary_min" label="From" error={e("salary.min")}>
          <TextInput
            id="salary_min"
            name="salary_min"
            inputMode="decimal"
            defaultValue={content?.salary?.min ?? ""}
          />
        </Field>
        <Field id="salary_max" label="To" error={e("salary.max")}>
          <TextInput
            id="salary_max"
            name="salary_max"
            inputMode="decimal"
            defaultValue={content?.salary?.max ?? ""}
          />
        </Field>
        <Field id="salary_currency" label="Currency">
          <Select id="salary_currency" name="salary_currency" defaultValue={content?.salary?.currency ?? ""}>
            <option value="">Not stated</option>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </Field>
        <Field id="salary_period" label="Period">
          <Select id="salary_period" name="salary_period" defaultValue={content?.salary?.period ?? ""}>
            <option value="">Not stated</option>
            {PERIODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <Field
        id="deadline_day"
        label="Closing date (optional)"
        hint="The last day applications are accepted (Harare time)."
        error={e("deadline_at")}
      >
        <TextInput
          id="deadline_day"
          name="deadline_day"
          type="date"
          defaultValue={dayOf(content)}
          invalid={Boolean(e("deadline_at"))}
        />
      </Field>

      <fieldset className="grid gap-3 rounded-card border border-border-panel p-3">
        <legend className="px-1 text-small font-strong">How people apply</legend>
        <p className="text-small text-muted">Applications go to you, not to NextJob.</p>
        <Field id="application_method" label="Method">
          <Select
            id="application_method"
            name="application_method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="external_url">On your website</option>
            <option value="email">By e-mail</option>
            <option value="instructions">Follow written instructions</option>
          </Select>
        </Field>
        {method === "external_url" ? (
          <Field
            id="application_url"
            label="Web address"
            hint="Starts with https://"
            error={e("application_url")}
          >
            <TextInput
              id="application_url"
              name="application_url"
              type="url"
              maxLength={2048}
              defaultValue={content?.application_url ?? ""}
              invalid={Boolean(e("application_url"))}
            />
          </Field>
        ) : null}
        {method === "email" ? (
          <Field id="application_email" label="E-mail address" error={e("application_email")}>
            <TextInput
              id="application_email"
              name="application_email"
              type="email"
              maxLength={254}
              defaultValue={content?.application_email ?? ""}
              invalid={Boolean(e("application_email"))}
            />
          </Field>
        ) : null}
        {method === "instructions" ? (
          <Field id="application_instructions" label="Instructions" error={e("application_instructions")}>
            <Textarea
              id="application_instructions"
              name="application_instructions"
              rows={4}
              maxLength={2000}
              defaultValue={content?.application_instructions ?? ""}
              invalid={Boolean(e("application_instructions"))}
            />
          </Field>
        ) : null}
      </fieldset>
      <Field id="reference_number" label="Your reference number (optional)">
        <TextInput
          id="reference_number"
          name="reference_number"
          maxLength={100}
          defaultValue={content?.reference_number ?? ""}
        />
      </Field>

      <fieldset className="grid gap-3 rounded-card border border-border-panel p-3">
        <legend className="px-1 text-small font-strong">More about this opportunity (optional)</legend>
        <Field id="vacancies" label="Number of vacancies" error={e("detail.vacancies")}>
          <TextInput
            id="vacancies"
            name="vacancies"
            inputMode="numeric"
            defaultValue={detail.vacancies ?? ""}
          />
        </Field>
        {category === "jobs" ? (
          <Field id="minimum_qualification" label="Minimum qualification">
            <Select
              id="minimum_qualification"
              name="minimum_qualification"
              defaultValue={String(detail.minimum_qualification ?? "")}
            >
              <option value="">Not stated</option>
              {QUALIFICATIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {category === "internships" ? (
          <>
            <Field
              id="placement_type"
              label="Placement type (needed to submit)"
              error={e("detail.placement_type")}
            >
              <Select
                id="placement_type"
                name="placement_type"
                defaultValue={String(detail.placement_type ?? "")}
              >
                <option value="">Choose</option>
                {PLACEMENTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="duration_months" label="Duration in months">
              <TextInput
                id="duration_months"
                name="duration_months"
                inputMode="numeric"
                defaultValue={detail.duration_months ?? ""}
              />
            </Field>
          </>
        ) : null}
        {category === "graduate-programmes" ? (
          <Field id="programme_length_months" label="Programme length in months">
            <TextInput
              id="programme_length_months"
              name="programme_length_months"
              inputMode="numeric"
              defaultValue={detail.programme_length_months ?? ""}
            />
          </Field>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "Working…" : "Save draft"}
        </Button>
        <Button type="button" disabled={busy} onClick={(event) => run(event, true)}>
          Submit for review
        </Button>
      </div>
      <p className="text-small text-muted">
        Submitting freezes this version and sends it to NextJob editors. It is not public until an editor who
        did not write it approves and publishes it.
      </p>
    </form>
  );
}
