"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FormError } from "@/components/account/parts";
import { Button, Checkbox, Select, TextInput, Textarea } from "@/components/ui";
import type { Location } from "@/lib/catalog-types";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { humanise } from "@/lib/format";
import {
  buildContent,
  canCreate,
  emptyState,
  hasDetail,
  JOB_TYPES,
  moreDetailFields,
  PAY_CATEGORIES,
  SOURCE_KINDS,
  stateFromDraft,
  type EditorState,
} from "@/lib/job-editor";
import type { ListingDetail, StaffCategory } from "@/lib/staff-types";
import { ActionPanel } from "./action-panel";
import { DetailInput } from "./detail-input";
import {
  ApplyFields,
  BulletTextarea,
  LocationPicker,
  OrganisationPicker,
  Row,
  SalaryField,
} from "./job-editor-parts";

type Option = { id: string; name: string };
type Errors = Record<string, string>;
type Save = "idle" | "saving" | "saved" | "failed";

const WORK_MODES = [
  ["on_site", "On site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;
const EXPERIENCE = [
  ["none", "No experience needed"],
  ["entry", "Entry level"],
  ["mid", "Mid level"],
  ["senior", "Senior"],
  ["executive", "Executive"],
] as const;

/** The first message of each error path, so the form can show one inline message per field. */
function flatten(fields: Record<string, string[]>): Errors {
  const out: Errors = {};
  for (const [key, messages] of Object.entries(fields)) if (messages[0]) out[key] = messages[0];
  return out;
}

const firstOf = (errors: Errors, ...prefixes: string[]): string | undefined => {
  for (const key of Object.keys(errors))
    if (prefixes.some((p) => key === p || key.startsWith(`${p}.`))) return errors[key];
  return undefined;
};

const clock = () =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" }).format(
    new Date(),
  );

/** A collapsed section. Native `details` keeps its inputs mounted while closed, so nothing typed is lost. */
function Section({
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

const counter = (value: string, max: number) => (
  <span className={`text-small ${value.length > max ? "text-danger" : "text-muted"}`}>
    {value.length}/{max}
  </span>
);

/**
 * The staff job editor (D-55): the eleven things a verified listing needs, in order, then three collapsed sections.
 * Drafts autosave (the API refuses a stale `row_version`, so two tabs cannot overwrite each other); publishing and
 * submitting go through the audited actions, never around them.
 */
export function JobEditor({
  mode,
  categories,
  listing,
  locations,
  sectors,
  canCreateOrganisation,
  today,
}: {
  mode: "new" | "edit";
  categories: StaffCategory[];
  listing?: ListingDetail;
  locations: Location[];
  sectors: Option[];
  canCreateOrganisation: boolean;
  today: string;
}) {
  const router = useRouter();
  const pending = listing?.pending && !listing.pending.hidden ? listing.pending : null;
  const firstCategory =
    listing?.category.code ??
    categories.find((c) => c.code === "jobs")?.code ??
    categories[0]?.code ??
    "jobs";
  const [state, setState] = useState<EditorState>(() =>
    pending && listing
      ? stateFromDraft(
          pending.content,
          categories.find((c) => c.code === listing.category.code) ?? categories[0]!,
          pending.organisation,
        )
      : emptyState(firstCategory),
  );
  const [id, setId] = useState<string | null>(listing?.id ?? null);
  const [rowVersion, setRowVersion] = useState(listing?.row_version ?? 0);
  const [detail, setDetail] = useState<ListingDetail | undefined>(listing);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [save, setSave] = useState<Save>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);

  const category = categories.find((c) => c.code === state.category) ?? categories[0]!;
  const pays = PAY_CATEGORIES.includes(category.code);
  const addressLocked = Boolean(detail?.slug);
  const e = (...paths: string[]) => firstOf(errors, ...paths);

  const set = useCallback((patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch })), []);
  const dirty = useRef(false);
  const busy = useRef(false);
  const latest = useRef({ state, id, rowVersion, detail });
  useEffect(() => {
    latest.current = { state, id, rowVersion, detail };
  });

  /** Creates the draft the first time, then saves. `loud` shows the server's field errors; autosave only reports status. */
  const persist = useCallback(
    async (loud: boolean): Promise<boolean> => {
      if (busy.current) {
        dirty.current = true;
        return false;
      }
      const cur = latest.current;
      if (!cur.id && !canCreate(cur.state)) return false;
      busy.current = true;
      dirty.current = false;
      setSave("saving");
      if (loud) {
        setErrors({});
        setFailure(null);
      }
      try {
        let draftId = cur.id;
        let version = cur.rowVersion;
        if (!draftId) {
          const created = await apiFetch<ListingDetail>("POST", "staff/opportunities", {
            category: cur.state.category,
            organisation_id: cur.state.organisation?.id,
            title: cur.state.title.trim(),
          });
          if (!created.ok) {
            setSave("failed");
            if (loud) {
              if (created.code === "validation_failed") setErrors(flatten(created.fields));
              setFailure(describeFailure(created));
            }
            return false;
          }
          draftId = created.data.id;
          version = created.data.row_version;
          setId(draftId);
          setDetail(created.data);
          // The page is now the draft's own address, without a navigation that would reload what is typed.
          window.history.replaceState(null, "", `/workspace/opportunities/${draftId}/edit`);
        }
        const existing =
          latest.current.detail?.pending && !latest.current.detail.pending.hidden
            ? latest.current.detail.pending.content
            : null;
        const built = buildContent(cur.state, category, existing, { today, addressLocked });
        if (Object.keys(built.errors).length) {
          setSave("failed");
          if (loud) {
            setErrors(built.errors as unknown as Errors);
            setFailure("Fix the points below, then save again.");
          }
          return false;
        }
        const result = await apiFetch<ListingDetail>("PATCH", `staff/opportunities/${draftId}/draft`, {
          row_version: version,
          content: built.content,
        });
        if (!result.ok) {
          setSave("failed");
          if (result.code === "validation_failed") {
            const flat = flatten(result.fields);
            if (loud) {
              setErrors(flat);
              setFailure("The draft was not saved. Fix the points below.");
              setOpen((o) => ({
                ...o,
                more:
                  o.more ||
                  Object.keys(flat).some((k) =>
                    /^(work_mode|experience_level|reference_number|contact_details|geographic|location_text|funding|detail|sector)/.test(
                      k,
                    ),
                  ),
                media: o.media || Object.keys(flat).some((k) => /^(slug|seo_|og_)/.test(k)),
                source:
                  o.source ||
                  Object.keys(flat).some((k) => k.startsWith("sources.") && !k.startsWith("sources.0")),
              }));
            }
          } else if (loud || result.code === "state_conflict")
            setFailure(
              result.code === "state_conflict"
                ? "This draft was changed somewhere else. Reload the page to see the latest version."
                : describeFailure(result),
            );
          return false;
        }
        setRowVersion(result.data.row_version);
        setDetail(result.data);
        setSave("saved");
        setSavedAt(clock());
        return true;
      } finally {
        busy.current = false;
        if (dirty.current) {
          dirty.current = false;
          window.setTimeout(() => void persist(false), 0);
        }
      }
    },
    [category, today, addressLocked],
  );

  // Autosave: a few seconds after the last change, once a draft exists or can be created.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!id && !canCreate(state)) return;
    const timer = window.setTimeout(() => void persist(false), 2500);
    return () => window.clearTimeout(timer);
  }, [state, id, persist]);

  // Warn before leaving with changes that have not been saved yet.
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => {
      if (save === "failed" || save === "saving") ev.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const verb =
    detail?.actions.find((a) => a.name === "publish_direct") ??
    detail?.actions.find((a) => a.name === "submit") ??
    null;
  const jobTypes = JOB_TYPES[category.code] ?? [];
  const vacanciesHere = hasDetail(category, "vacancies");
  const more = moreDetailFields(category);
  const sourceErrors = e("sources");
  const seoText = {
    title:
      state.ogTitle || state.seoTitle || [state.title, state.organisation?.name].filter(Boolean).join(" at "),
    description:
      state.ogDescription ||
      state.seoDescription ||
      state.summary ||
      state.responsibilities
        .replace(/^\s*[-*]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
  };

  async function previewClick() {
    // Whatever is typed is saved first, so the preview is exactly the draft.
    if (await persist(true)) router.push(`/workspace/opportunities/${latest.current.id}/preview`);
  }

  async function publishClick() {
    const ok = await persist(true);
    if (ok) setPublishing(true);
  }

  const status =
    save === "saving"
      ? "Saving…"
      : save === "saved"
        ? `Saved at ${savedAt}`
        : save === "failed"
          ? "Not saved"
          : id
            ? "All changes saved"
            : canCreate(state)
              ? "Autosave starts in a moment"
              : "Autosave starts once the organisation and title are set";

  return (
    <div className="max-w-[760px]">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void persist(true);
        }}
        noValidate
        aria-label={mode === "new" ? "New opportunity" : `Edit draft: ${state.title || "Untitled draft"}`}
        className="grid gap-4"
      >
        {failure ? <FormError>{failure}</FormError> : null}

        {mode === "new" && !id ? (
          <Row id="category" title="Category" hint="It cannot be changed after the draft is created.">
            <Select
              id="category"
              value={state.category}
              onChange={(ev) => set({ category: ev.target.value, employmentType: "", salaryMode: "none" })}
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

        <Row id="title" title="Job title" error={e("title")}>
          <TextInput
            id="title"
            value={state.title}
            maxLength={200}
            required
            invalid={Boolean(e("title"))}
            aria-describedby={e("title") ? "title-error" : undefined}
            onChange={(ev) => set({ title: ev.target.value })}
          />
        </Row>

        <Row id="organisation" title="Organisation" error={e("organisation_id")}>
          <OrganisationPicker
            value={state.organisation}
            onChange={(organisation) => set({ organisation })}
            canCreate={canCreateOrganisation}
            error={e("organisation_id")}
          />
        </Row>

        <div className="grid gap-4 sm:grid-cols-2">
          {vacanciesHere ? (
            <Row id="vacancies" title="Vacancies" optional error={e("detail.vacancies")}>
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
                <option value="">Not stated</option>
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

        <fieldset className="grid gap-1 border-0 p-0">
          <legend className="mb-1 text-ctl font-medium text-check-text">Location</legend>
          <LocationPicker
            options={locations}
            value={state.locationIds}
            onChange={(locationIds) => set({ locationIds })}
            error={e("locations")}
          />
        </fieldset>

        {pays ? (
          <fieldset className="grid gap-1 border-0 p-0">
            <legend className="mb-1 text-ctl font-medium text-check-text">
              Salary <span className="font-light text-muted">(optional, only what the source states)</span>
            </legend>
            <SalaryField state={state} set={set} error={e("salary", "salary_text")} />
          </fieldset>
        ) : null}

        <Row
          id="summary"
          title="Job overview"
          optional
          hint="One or two sentences, only if the source gives them."
          error={e("summary")}
        >
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

        <BulletTextarea
          id="responsibilities"
          title={pays ? "Key responsibilities" : "Description"}
          hint="Use • List to turn lines into bullets. Copy only what the source says."
          value={state.responsibilities}
          onChange={(responsibilities) => set({ responsibilities })}
          error={e("description_md")}
          rows={7}
        />
        <BulletTextarea
          id="qualifications"
          title={pays ? "Qualifications & experience" : "Eligibility & requirements"}
          value={state.qualifications}
          onChange={(qualifications) => set({ qualifications })}
          error={e("requirements_md")}
          optional
          rows={5}
        />

        <fieldset className="grid gap-1 border-0 p-0">
          <legend className="mb-1 text-ctl font-medium text-check-text">How to apply</legend>
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
        </fieldset>

        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="mb-1 text-ctl font-medium text-check-text">Original source</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Row
              id="source_url"
              title="Source link"
              optional
              error={e("sources.0.url")}
              hint="Where the vacancy was published, not where people apply."
            >
              <TextInput
                id="source_url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={state.sourceUrl}
                invalid={Boolean(e("sources.0.url"))}
                onChange={(ev) => set({ sourceUrl: ev.target.value })}
              />
            </Row>
            <Row id="source_kind" title="Source type">
              <Select
                id="source_kind"
                value={state.sourceKind}
                onChange={(ev) => set({ sourceKind: ev.target.value })}
              >
                {SOURCE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Row>
          </div>
          <Row
            id="source_reference"
            title="Or a reference"
            optional
            hint="A notice, page or gazette number when there is no link."
          >
            <TextInput
              id="source_reference"
              maxLength={500}
              value={state.sourceReference}
              onChange={(ev) => set({ sourceReference: ev.target.value })}
            />
          </Row>
          {sourceErrors ? (
            <p role="alert" className="m-0 text-small text-danger">
              <span className="font-strong">Error:</span> {sourceErrors}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-2">
          <Section
            id="more"
            title="More details"
            summary="Work arrangement, experience, funding, sectors and category details"
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
              {pays ? (
                <Row id="experience_level" title="Experience level" error={e("experience_level")}>
                  <Select
                    id="experience_level"
                    value={state.experienceLevel}
                    onChange={(ev) => set({ experienceLevel: ev.target.value })}
                  >
                    <option value="">Not stated</option>
                    {EXPERIENCE.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Row>
              ) : null}
              <Row id="reference_number" title="Reference number" optional error={e("reference_number")}>
                <TextInput
                  id="reference_number"
                  maxLength={100}
                  value={state.referenceNumber}
                  onChange={(ev) => set({ referenceNumber: ev.target.value })}
                />
              </Row>
              <Row id="location_text" title="Location, as written" optional error={e("location_text")}>
                <TextInput
                  id="location_text"
                  maxLength={200}
                  value={state.locationText}
                  onChange={(ev) => set({ locationText: ev.target.value })}
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
              {!pays ? (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
                  <Row id="funding_min" title="Funding from" error={e("funding")}>
                    <TextInput
                      id="funding_min"
                      inputMode="decimal"
                      value={state.fundingMin}
                      onChange={(ev) => set({ fundingMin: ev.target.value })}
                    />
                  </Row>
                  <Row id="funding_max" title="Funding to">
                    <TextInput
                      id="funding_max"
                      inputMode="decimal"
                      value={state.fundingMax}
                      onChange={(ev) => set({ fundingMax: ev.target.value })}
                    />
                  </Row>
                  <Row id="funding_currency" title="Currency">
                    <Select
                      id="funding_currency"
                      value={state.fundingCurrency}
                      onChange={(ev) => set({ fundingCurrency: ev.target.value })}
                    >
                      <option value="USD">USD</option>
                      <option value="ZWG">ZWG</option>
                    </Select>
                  </Row>
                  <Row id="funding_period" title="Period">
                    <Select
                      id="funding_period"
                      value={state.fundingPeriod}
                      onChange={(ev) => set({ fundingPeriod: ev.target.value })}
                    >
                      <option value="">-</option>
                      <option value="month">per month</option>
                      <option value="year">per year</option>
                      <option value="once">one-off</option>
                    </Select>
                  </Row>
                </div>
              ) : null}
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
          </Section>

          <Section
            id="media"
            title="Media & SEO"
            summary={addressLocked ? "Address is permanent" : "Address, search and sharing text"}
            open={Boolean(open.media)}
            onToggle={(v) => setOpen((o) => ({ ...o, media: v }))}
          >
            <Row
              id="slug"
              title="Web address"
              error={e("slug")}
              hint={
                addressLocked
                  ? "A published address never changes, so shared links keep working."
                  : "Optional. Lower-case letters, digits and hyphens. Chosen when the listing is first published; otherwise made from the title."
              }
            >
              <div className="flex items-center gap-1">
                <span className="text-small text-muted">upnext.co.zw/opportunities/</span>
                <TextInput
                  id="slug"
                  value={addressLocked ? (detail?.slug ?? "") : state.slug}
                  readOnly={addressLocked}
                  maxLength={80}
                  invalid={Boolean(e("slug"))}
                  aria-describedby={e("slug") ? "slug-error" : "slug-hint"}
                  onChange={(ev) => set({ slug: ev.target.value.toLowerCase() })}
                />
              </div>
            </Row>
            <Row
              id="seo_title"
              title="Search title"
              optional
              error={e("seo_title")}
              hint="Empty: the job title and organisation are used."
            >
              <TextInput
                id="seo_title"
                maxLength={70}
                value={state.seoTitle}
                invalid={Boolean(e("seo_title"))}
                onChange={(ev) => set({ seoTitle: ev.target.value })}
              />
              {counter(state.seoTitle, 70)}
            </Row>
            <Row id="seo_description" title="Search description" optional error={e("seo_description")}>
              <Textarea
                id="seo_description"
                rows={2}
                maxLength={200}
                value={state.seoDescription}
                invalid={Boolean(e("seo_description"))}
                onChange={(ev) => set({ seoDescription: ev.target.value })}
              />
              {counter(state.seoDescription, 200)}
            </Row>
            <Row
              id="og_title"
              title="Sharing title"
              optional
              error={e("og_title")}
              hint="Shown when the link is shared. Empty: the search title is used."
            >
              <TextInput
                id="og_title"
                maxLength={90}
                value={state.ogTitle}
                invalid={Boolean(e("og_title"))}
                onChange={(ev) => set({ ogTitle: ev.target.value })}
              />
              {counter(state.ogTitle, 90)}
            </Row>
            <Row id="og_description" title="Sharing description" optional error={e("og_description")}>
              <Textarea
                id="og_description"
                rows={2}
                maxLength={200}
                value={state.ogDescription}
                invalid={Boolean(e("og_description"))}
                onChange={(ev) => set({ ogDescription: ev.target.value })}
              />
              {counter(state.ogDescription, 200)}
            </Row>
            <div className="grid gap-1" aria-label="Sharing preview">
              <p className="m-0 text-ctl font-medium text-check-text">Sharing preview</p>
              <div className="rounded-card border border-border-panel p-3">
                <p className="m-0 text-small text-muted">upnext.co.zw</p>
                <p className="m-0 mt-0.5 text-base font-medium">
                  {seoText.title || "Job title at Organisation"}
                </p>
                <p className="m-0 mt-0.5 text-small text-muted">
                  {seoText.description || "A short description appears here."}
                </p>
              </div>
              <p className="m-0 text-small text-muted">
                Featured and sharing images cannot be uploaded yet: links are shared with the standard UPNEXT
                image.
              </p>
            </div>
          </Section>

          <Section
            id="source"
            title="Source & verification"
            summary={detail ? detail.verification_label : "Recorded separately, by someone else"}
            open={Boolean(open.source)}
            onToggle={(v) => setOpen((o) => ({ ...o, source: v }))}
          >
            <Row
              id="source_observed_on"
              title="Primary source checked on"
              hint="The day you looked at the source. A new or changed link is dated today."
            >
              <TextInput
                id="source_observed_on"
                type="date"
                max={today}
                value={state.sourceObservedOn}
                onChange={(ev) => set({ sourceObservedOn: ev.target.value })}
              />
            </Row>
            {state.otherSources.map((src, index) => (
              <div key={index} className="grid gap-2 rounded-card border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Row id={`os-${index}-kind`} title="Kind">
                    <Select
                      id={`os-${index}-kind`}
                      value={src.kind}
                      onChange={(ev) =>
                        set({
                          otherSources: state.otherSources.map((x, i) =>
                            i === index ? { ...x, kind: ev.target.value } : x,
                          ),
                        })
                      }
                    >
                      {SOURCE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                  </Row>
                  <Row id={`os-${index}-name`} title="Name" error={e(`sources.${index + 1}.name`)}>
                    <TextInput
                      id={`os-${index}-name`}
                      maxLength={200}
                      value={src.name}
                      onChange={(ev) =>
                        set({
                          otherSources: state.otherSources.map((x, i) =>
                            i === index ? { ...x, name: ev.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Row>
                  <Row
                    id={`os-${index}-url`}
                    title="Web address"
                    optional
                    error={e(`sources.${index + 1}.url`)}
                  >
                    <TextInput
                      id={`os-${index}-url`}
                      value={src.url ?? ""}
                      onChange={(ev) =>
                        set({
                          otherSources: state.otherSources.map((x, i) =>
                            i === index ? { ...x, url: ev.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Row>
                  <Row id={`os-${index}-date`} title="Checked on">
                    <TextInput
                      id={`os-${index}-date`}
                      type="date"
                      value={src.observed_on}
                      onChange={(ev) =>
                        set({
                          otherSources: state.otherSources.map((x, i) =>
                            i === index ? { ...x, observed_on: ev.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Row>
                  <Row id={`os-${index}-cite`} title="Reference" optional className="sm:col-span-2">
                    <TextInput
                      id={`os-${index}-cite`}
                      maxLength={500}
                      value={src.citation ?? ""}
                      onChange={(ev) =>
                        set({
                          otherSources: state.otherSources.map((x, i) =>
                            i === index ? { ...x, citation: ev.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Row>
                </div>
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => set({ otherSources: state.otherSources.filter((_, i) => i !== index) })}
                  >
                    Remove this source
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  set({
                    otherSources: [
                      ...state.otherSources,
                      {
                        kind: "other",
                        name: "",
                        url: null,
                        citation: null,
                        observed_on: today,
                        is_primary: false,
                      },
                    ],
                  })
                }
              >
                Add another source
              </Button>
            </div>
            <div className="grid gap-1 rounded-card bg-surface-pale p-3 text-small">
              <p className="m-0 font-medium">Verification</p>
              <p className="m-0 text-muted">
                A source link or document is where the information came from, not proof that it is genuine.
                Verification is checked and recorded separately, by someone other than the author.
              </p>
              {detail ? (
                <>
                  <p className="m-0">Current status: {detail.verification_label}</p>
                  {detail.verifications.length ? (
                    <ul className="m-0 list-disc pl-5">
                      {detail.verifications.slice(-3).map((v) => (
                        <li key={`${v.version_no}-${v.checked_at}`}>
                          {humanise(v.outcome)} ({humanise(v.method)}) by {v.checked_by}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 text-muted">No verification has been recorded yet.</p>
                  )}
                  <Link href={`/workspace/opportunities/${detail.id}`} className="text-accent underline">
                    Open the full audit history
                  </Link>
                </>
              ) : (
                <p className="m-0 text-muted">The history appears once the draft exists.</p>
              )}
            </div>
          </Section>
        </div>

        {detail?.warnings.length ? (
          <ul className="m-0 grid list-none gap-1 rounded-card border border-border-notice bg-surface-notice p-3 text-ctl">
            {detail.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div
          className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 px-4 py-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur-[8px] sm:mx-0 sm:rounded-card sm:border"
          role="group"
          aria-label="Draft actions"
        >
          <Button type="submit" disabled={save === "saving" || (!id && !canCreate(state))}>
            Save draft
          </Button>
          {id && detail ? (
            <Button variant="secondary" onClick={() => void previewClick()} disabled={save === "saving"}>
              Preview
            </Button>
          ) : null}
          {verb ? (
            <Button variant="primary" onClick={() => void publishClick()} disabled={save === "saving"}>
              {verb.name === "publish_direct" ? "Publish" : "Submit for review"}
            </Button>
          ) : null}
          <span role="status" aria-live="polite" className="ml-auto text-small text-muted">
            {status}
          </span>
        </div>
      </form>

      {publishing && id && detail && verb ? (
        <div className="mt-4" id="publish">
          <ActionPanel
            key={rowVersion}
            endpoint={`staff/opportunities/${id}/actions`}
            rowVersion={rowVersion}
            actions={detail.actions.filter((a) => a.name === verb.name)}
            initial={verb.name}
          />
        </div>
      ) : null}
    </div>
  );
}
