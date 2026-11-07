"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Checkbox, RichTextEditor, Select, Textarea, TextInput } from "@/components/ui";
import { DetailInput } from "@/components/workspace/detail-input";
import { ImageUpload } from "@/components/workspace/image-upload";
import { ApplyFields, Row } from "@/components/workspace/job-editor-parts";
import type { Location } from "@/lib/catalog-types";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { STATUS_LABEL, type EmployerListingDetail, type ListingContent } from "@/lib/employer-types";
import {
  buildContent,
  emptyState,
  hasDetail,
  JOB_TYPES,
  moreDetailFields,
  PAY_CATEGORIES,
  stateFromDraft,
  type EditorState,
} from "@/lib/job-editor";
import type { DraftContent, StaffCategory } from "@/lib/staff-types";

type Errors = Record<string, string>;

const WORK_MODES = [
  ["on_site", "On site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;

/** Content the server never accepts from an employer: the organisation is fixed by the membership, and the
 *  address and the search and sharing text are written by staff (D-56). They are removed before sending. */
const STAFF_ONLY = ["organisation_id", "slug", "seo_title", "seo_description", "og_title", "og_description"];

/** The employer API's content in the shape the shared editor state expects (no sources or staff text exist). */
export function toDraft(content: ListingContent): DraftContent {
  return {
    ...content,
    locations: content.locations.map((l) => ({
      location_id: l.location_id,
      name: l.name,
      is_primary: l.is_primary,
    })),
    salary_text: content.salary_text ?? null,
    geographic_eligibility: content.geographic_eligibility ?? null,
    funding: content.funding ?? null,
    application_email_subject: content.application_email_subject ?? null,
    contact_details: content.contact_details ?? null,
    skills: content.skills ?? [],
    sector_ids: content.sector_ids ?? [],
    sectors: [],
    sources: [],
    slug: null,
    seo_title: null,
    seo_description: null,
    og_title: null,
    og_description: null,
  } as DraftContent;
}

const firstOf = (errors: Errors, ...prefixes: string[]): string | undefined => {
  for (const key of Object.keys(errors))
    if (prefixes.some((p) => key === p || key.startsWith(`${p}.`))) return errors[key];
  return undefined;
};

function Block({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-card border border-border-panel bg-surface p-3 sm:p-4"
    >
      <div>
        <h2 id={`${id}-title`} className="m-0 text-base font-medium">
          {title}
        </h2>
        {hint ? <p className="m-0 mt-0.5 text-small text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A part that starts closed. Native `details` keeps its inputs mounted while closed, so nothing typed is lost. */
function Collapsed({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-card border border-border-panel bg-surface"
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span className="text-base font-medium">{title}</span>
        <span className="text-small text-muted">{summary}</span>
      </summary>
      <div className="grid gap-4 border-t border-line p-3">{children}</div>
    </details>
  );
}

/**
 * The employer's Create / Edit Opportunity form. It uses the staff editor's field set, state mapping
 * (`lib/job-editor`) and parts (`Row`, `RichTextEditor`, `ApplyFields`, `DetailInput`, `ImageUpload`) so both
 * forms carry the same simplified fields. What differs is who decides: there is no organisation field (the
 * server uses the organisation the member acts for), no address or search text (staff write those), no
 * sources (recorded automatically) and no verification or approval control. Saving is explicit; the API
 * refuses a stale `row_version`, so two tabs cannot overwrite each other.
 */
export function OpportunityForm({
  organisation,
  categories,
  locations,
  sectors,
  listing,
}: {
  organisation: { id: string; name: string };
  categories: StaffCategory[];
  locations: Location[];
  sectors: { id: string; name: string }[];
  listing?: EmployerListingDetail;
}) {
  const router = useRouter();
  const first =
    listing?.category.code ??
    categories.find((c) => c.code === "jobs")?.code ??
    categories[0]?.code ??
    "jobs";
  const [state, setState] = useState<EditorState>(() => {
    const cat = categories.find((c) => c.code === first) ?? categories[0]!;
    return listing
      ? stateFromDraft(toDraft(listing.content), cat, organisation, locations)
      : { ...emptyState(first), organisation };
  });
  const [rowVersion, setRowVersion] = useState(listing?.row_version ?? 0);
  const [id, setId] = useState<string | null>(listing?.id ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const category = categories.find((c) => c.code === state.category) ?? categories[0]!;
  const pays = PAY_CATEGORIES.includes(category.code);
  const jobTypes = JOB_TYPES[category.code] ?? [];
  const vacanciesHere = hasDetail(category, "vacancies");
  const more = moreDetailFields(category);
  const e = (...paths: string[]) => firstOf(errors, ...paths);
  const set = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

  /** Creates the draft the first time and saves it after that. Returns the listing id when it worked. */
  async function persist(): Promise<string | null> {
    setBusy(true);
    setErrors({});
    setFailure(null);
    setSaved(false);
    const existing = listing ? toDraft(listing.content) : null;
    const built = buildContent(state, category, existing, { addressLocked: true, places: locations });
    if (Object.keys(built.errors).length) {
      setBusy(false);
      setErrors(Object.fromEntries(Object.entries(built.errors).map(([k, v]) => [k, v[0] ?? ""])));
      return null;
    }
    const content = { ...built.content };
    for (const key of STAFF_ONLY) delete content[key];
    const outcome = id
      ? await apiFetch<EmployerListingDetail>("PATCH", `employer/listings/${id}`, {
          row_version: rowVersion,
          content,
        })
      : await apiFetch<EmployerListingDetail>("POST", `employer/organisations/${organisation.id}/listings`, {
          category: state.category,
          content,
        });
    setBusy(false);
    if (!outcome.ok) {
      if (outcome.code === "validation_failed") {
        const flat: Errors = {};
        for (const [key, messages] of Object.entries(outcome.fields))
          if (messages[0]) flat[key] = messages[0];
        setErrors(flat);
        const hidden = Object.keys(flat).some(
          (k) =>
            k.startsWith("detail.") ||
            ["work_mode", "reference_number", "geographic_eligibility", "contact_details"].includes(k),
        );
        if (hidden) setOpen((o) => ({ ...o, more: true }));
        if (Object.keys(flat).some((k) => k.startsWith("featured_image") || k === "social_image"))
          setOpen((o) => ({ ...o, media: true }));
      } else setFailure(describeFailure(outcome));
      return null;
    }
    setId(outcome.data.id);
    setRowVersion(outcome.data.row_version);
    return outcome.data.id;
  }

  async function saveDraft() {
    const saved = await persist();
    if (!saved) return;
    if (!listing) {
      router.push(`/employer/listings/${saved}`);
    } else setSaved(true);
    router.refresh();
  }

  async function preview() {
    const saved = await persist();
    if (saved) router.push(`/employer/listings/${saved}/preview`);
  }

  async function submit() {
    const draftId = await persist();
    if (!draftId) return;
    setBusy(true);
    const latest = await apiFetch<EmployerListingDetail>("GET", `employer/listings/${draftId}`);
    const version = latest.ok ? latest.data.row_version : rowVersion;
    const sent = await apiFetch<EmployerListingDetail>("POST", `employer/listings/${draftId}/submit`, {
      row_version: version,
    });
    setBusy(false);
    if (!sent.ok) {
      if (sent.code === "validation_failed" || sent.code === "duplicate_detected") {
        const flat: Errors = {};
        for (const [key, messages] of Object.entries(sent.fields)) if (messages[0]) flat[key] = messages[0];
        setErrors(flat);
        setFailure("The draft was saved, but it is not ready to submit yet. Fix the points below.");
        setOpen((o) => ({ ...o, more: true }));
      } else setFailure(describeFailure(sent));
      if (!listing) router.replace(`/employer/listings/${draftId}`);
      return;
    }
    router.push(`/employer/listings/${draftId}`);
    router.refresh();
  }

  const known = new Set([
    "title",
    "summary",
    "description_md",
    "requirements_md",
    "employment_type",
    "deadline_at",
    "locations",
    "location_text",
    "salary",
    "salary_text",
    "application_url",
    "application_email",
    "application_email_subject",
    "application_instructions",
    "featured_image",
    "social_image",
    "featured_image_alt",
    "work_mode",
    "reference_number",
    "geographic_eligibility",
    "contact_details",
    "detail.vacancies",
  ]);
  const loose = Object.entries(errors).filter(([key]) => !known.has(key) && !key.startsWith("detail."));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void saveDraft();
      }}
      noValidate
      aria-label={listing ? `Edit: ${state.title || "Untitled draft"}` : "New opportunity"}
      className="grid max-w-[860px] gap-4"
      data-testid="opportunity-form"
    >
      {failure ? <FormError>{failure}</FormError> : null}
      {loose.length ? (
        <div
          role="alert"
          className="border border-danger p-[10px] text-base text-danger"
          data-testid="listing-errors"
        >
          <p className="m-0 font-strong">Check these points:</p>
          <ul className="m-0 list-disc pl-5">
            {loose.map(([key, message]) => (
              <li key={key}>
                {key.replaceAll("_", " ")}: {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {saved ? <FormSuccess>Draft saved.</FormSuccess> : null}

      <Block id="basic" title="Basic information">
        {!listing && !id ? (
          <Row
            id="category"
            title="What are you posting?"
            hint="It cannot be changed after the draft is created."
          >
            <Select
              id="category"
              value={state.category}
              onChange={(ev) => set({ category: ev.target.value, employmentType: "" })}
            >
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Row>
        ) : (
          <p className="m-0 text-small text-muted">{category.name}</p>
        )}
        <Row
          id="title"
          title="Job title"
          error={e("title")}
          hint="At least 5 characters. Not all capitals, no web addresses."
        >
          <TextInput
            id="title"
            value={state.title}
            maxLength={200}
            required
            invalid={Boolean(e("title"))}
            aria-describedby={e("title") ? "title-error" : "title-hint"}
            onChange={(ev) => set({ title: ev.target.value })}
          />
        </Row>
        <p className="m-0 text-small text-muted" data-testid="organisation-fixed">
          Posting for <strong className="font-medium text-ink">{organisation.name}</strong>. Every opportunity
          you create belongs to this organisation.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {vacanciesHere ? (
            <Row id="vacancies" title="Number of vacancies" optional error={e("detail.vacancies")}>
              <TextInput
                id="vacancies"
                type="number"
                min={1}
                inputMode="numeric"
                value={typeof state.detail.vacancies === "string" ? state.detail.vacancies : ""}
                invalid={Boolean(e("detail.vacancies"))}
                onChange={(ev) => set({ detail: { ...state.detail, vacancies: ev.target.value } })}
              />
            </Row>
          ) : null}
          {jobTypes.length ? (
            <Row id="employment_type" title="Job type" error={e("employment_type")}>
              <Select
                id="employment_type"
                value={state.employmentType}
                invalid={Boolean(e("employment_type"))}
                onChange={(ev) => set({ employmentType: ev.target.value })}
              >
                <option value="">Choose</option>
                {jobTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Row>
          ) : null}
          <Row
            id="deadline_day"
            title="Closing date"
            optional
            error={e("deadline_at")}
            hint="Ends at the close of that day, Harare time."
          >
            <TextInput
              id="deadline_day"
              type="date"
              value={state.deadlineDay}
              invalid={Boolean(e("deadline_at"))}
              onChange={(ev) => set({ deadlineDay: ev.target.value })}
            />
          </Row>
        </div>
        <Row
          id="location_text"
          title="Location"
          error={e("locations", "location_text")}
          hint="Name every place, for example “Harare”, “Bulawayo and Gweru” or “Remote”. Known places are linked for search."
        >
          <TextInput
            id="location_text"
            maxLength={200}
            value={state.locationText}
            invalid={Boolean(e("locations", "location_text"))}
            aria-describedby={e("locations", "location_text") ? "location_text-error" : "location_text-hint"}
            onChange={(ev) => set({ locationText: ev.target.value })}
          />
        </Row>
        {pays ? (
          <Row
            id="salary"
            title="Salary"
            optional
            error={e("salary", "salary_text")}
            hint="Type it as advertised, for example “US$500 per month” or “Competitive”. Left empty, the page shows TBA."
          >
            <TextInput
              id="salary"
              maxLength={120}
              value={state.salaryText}
              invalid={Boolean(e("salary", "salary_text"))}
              aria-describedby={e("salary", "salary_text") ? "salary-error" : "salary-hint"}
              onChange={(ev) => set({ salaryText: ev.target.value })}
            />
          </Row>
        ) : null}
      </Block>

      <Block id="details" title="Job details">
        <Row id="summary" title="Job overview" optional hint="One or two sentences." error={e("summary")}>
          <Textarea
            id="summary"
            rows={2}
            maxLength={300}
            value={state.summary}
            invalid={Boolean(e("summary"))}
            aria-describedby={e("summary") ? "summary-error" : "summary-hint"}
            onChange={(ev) => set({ summary: ev.target.value })}
          />
        </Row>
        <RichTextEditor
          id="responsibilities"
          title={pays ? "Key responsibilities" : "Description"}
          hint="Use the toolbar for bold, lists and links. Applicants must never be asked to pay."
          value={state.responsibilities}
          onChange={(responsibilities) => set({ responsibilities })}
          error={e("description_md")}
          minHeight={170}
        />
        <RichTextEditor
          id="qualifications"
          title={pays ? "Qualifications & experience" : "Eligibility & requirements"}
          value={state.qualifications}
          onChange={(qualifications) => set({ qualifications })}
          error={e("requirements_md")}
          optional
          minHeight={130}
        />
      </Block>

      <Block id="apply-section" title="How to apply" hint="Applications go to you, not to UPNEXT.">
        <ApplyFields
          state={state}
          set={set}
          errors={{
            application_url: e("application_url"),
            application_email: e("application_email"),
            application_email_subject: e("application_email_subject"),
            application_instructions: e("application_instructions"),
          }}
        />
      </Block>

      <Collapsed
        id="media"
        title="Media & SEO"
        summary={state.featuredImage ? "Featured image set" : "Featured image, sharing image"}
        open={Boolean(open.media)}
        onToggle={(v) => setOpen((o) => ({ ...o, media: v }))}
      >
        <Row
          id="featured_image"
          title="Featured image"
          optional
          error={e("featured_image")}
          hint="Recommended 16:9 (for example 1280 × 720), JPEG, PNG or WebP up to 5 MB. Shown on the job page and used when the link is shared. A picture does not make an employer verified, and editors review it with the listing."
        >
          <ImageUpload
            id="featured_image"
            endpoint="employer/images"
            value={state.featuredImage}
            onChange={(featuredImage) =>
              set({ featuredImage, ...(featuredImage ? {} : { featuredAlt: "" }) })
            }
            alt={state.featuredAlt}
            onAltChange={(featuredAlt) => set({ featuredAlt })}
            describedBy="featured_image-hint"
            error={e("featured_image")}
          />
        </Row>
        <Row
          id="social_image"
          title="Sharing image"
          optional
          error={e("social_image")}
          hint="Used for link previews on social media. When empty, the featured image is used."
        >
          <ImageUpload
            id="social_image"
            endpoint="employer/images"
            ratio="1.91 / 1"
            buttonLabel="Upload sharing image"
            value={state.socialImage}
            onChange={(socialImage) => set({ socialImage })}
            error={e("social_image")}
          />
        </Row>
        <p className="m-0 text-small text-muted" data-testid="seo-note">
          The page address and the search and sharing text are written by UPNEXT editors when the listing is
          reviewed, so they stay consistent and accurate. The address is{" "}
          {listing?.public_path ? (
            <a href={listing.public_path} className="text-accent underline">
              {listing.public_path}
            </a>
          ) : (
            "created when the listing is published"
          )}
          .
        </p>
      </Collapsed>

      <Collapsed
        id="more"
        title="Additional details"
        summary="Work arrangement, reference, contact, sectors and category details"
        open={Boolean(open.more)}
        onToggle={(v) => setOpen((o) => ({ ...o, more: v }))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Row id="work_mode" title="Work arrangement" error={e("work_mode")}>
            <Select
              id="work_mode"
              value={state.workMode}
              onChange={(ev) => set({ workMode: ev.target.value })}
            >
              <option value="">Not stated</option>
              {WORK_MODES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Row>
          <Row id="reference_number" title="Your reference number" optional error={e("reference_number")}>
            <TextInput
              id="reference_number"
              maxLength={100}
              value={state.referenceNumber}
              onChange={(ev) => set({ referenceNumber: ev.target.value })}
            />
          </Row>
          <Row
            id="geographic_eligibility"
            title="Who may apply, and from where"
            optional
            className="sm:col-span-2"
            error={e("geographic_eligibility")}
          >
            <TextInput
              id="geographic_eligibility"
              maxLength={500}
              value={state.geographicEligibility}
              onChange={(ev) => set({ geographicEligibility: ev.target.value })}
            />
          </Row>
          <Row
            id="contact_details"
            title="Contact details"
            optional
            className="sm:col-span-2"
            error={e("contact_details")}
          >
            <TextInput
              id="contact_details"
              maxLength={500}
              value={state.contactDetails}
              onChange={(ev) => set({ contactDetails: ev.target.value })}
            />
          </Row>
          {more.map((f) => (
            <DetailInput
              key={f.name}
              field={f}
              value={state.detail[f.name]}
              error={e(`detail.${f.name}`)}
              onChange={(value) => set({ detail: { ...state.detail, [f.name]: value } })}
            />
          ))}
        </div>
        {sectors.length ? (
          <fieldset className="grid gap-2 border-0 p-0">
            <legend className="mb-1 text-ctl font-medium text-check-text">Sectors</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {sectors.map((s) => (
                <Checkbox
                  key={s.id}
                  id={`sector-${s.id}`}
                  label={s.name}
                  checked={state.sectorIds.includes(s.id)}
                  onChange={(ev) =>
                    set({
                      sectorIds: ev.target.checked
                        ? [...state.sectorIds, s.id]
                        : state.sectorIds.filter((x) => x !== s.id),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}
      </Collapsed>

      <Collapsed
        id="source"
        title="Source & verification"
        summary={listing ? STATUS_LABEL[listing.status] : "Review status"}
        open={Boolean(open.source)}
        onToggle={(v) => setOpen((o) => ({ ...o, source: v }))}
      >
        <dl className="m-0 grid gap-2 text-base">
          <div>
            <dt className="text-small text-muted">Review status</dt>
            <dd className="m-0" data-testid="review-status">
              {listing ? STATUS_LABEL[listing.status] : "Not saved yet"}
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted">Source</dt>
            <dd className="m-0">
              Recorded automatically when you submit: submitted by a member of {organisation.name}, a verified
              organisation, on that date. You do not need to add evidence.
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted">Verification</dt>
            <dd className="m-0">
              Set by UPNEXT editors after an independent check. You cannot mark your own listing verified or
              approve it, and nobody approves their own submission.
            </dd>
          </div>
        </dl>
      </Collapsed>

      <div className="flex flex-wrap gap-3" data-testid="form-actions">
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "Working…" : "Save draft"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void preview()}>
          Preview
        </Button>
        <Button disabled={busy} onClick={() => void submit()}>
          Submit for review
        </Button>
      </div>
      <p className="m-0 text-small text-muted">
        Submitting freezes this version and sends it to UPNEXT editors. It is not public until an editor who
        did not write it approves and publishes it.
      </p>
    </form>
  );
}
