/**
 * The simplified job editor's form state and how it maps to the stored draft (D-56).
 *
 * The eleven essential fields are edited directly; everything else the draft holds is kept as it is and sent
 * back unchanged unless the editor opened "More details" and changed it. Nothing is invented: an empty input is
 * an absent value, and a field the source does not give is simply left empty.
 */
import type { DetailField, DraftContent, SourceRow, StaffCategory } from "./staff-types";

export type Option = { value: string; label: string };
export type ApplyMethod = "external_url" | "email" | "both" | "instructions";
export type SalaryMode = "none" | "amount" | "range" | "text";

/** Categories where pay is a thing (the others carry funding instead), as the publish rules say. */
export const PAY_CATEGORIES = ["jobs", "internships", "graduate-programmes"];

export const APPLY_METHODS: Option[] = [
  { value: "external_url", label: "Application website" },
  { value: "email", label: "Application e-mail" },
  { value: "both", label: "Website and e-mail" },
  { value: "instructions", label: "Instructions only" },
];

/** Job types per category. The category fixes what is allowed (an internship is its own category). */
export const JOB_TYPES: Record<string, Option[]> = {
  jobs: [
    { value: "full_time", label: "Full-time" },
    { value: "part_time", label: "Part-time" },
    { value: "contract", label: "Contract" },
    { value: "temporary", label: "Temporary" },
    { value: "permanent", label: "Permanent" },
  ],
  internships: [{ value: "internship", label: "Internship" }],
  "graduate-programmes": [{ value: "trainee", label: "Trainee programme" }],
};

export const SOURCE_KINDS: Option[] = [
  { value: "issuer_website", label: "Issuer website" },
  { value: "issuer_notice", label: "Issuer notice" },
  { value: "government_gazette", label: "Government gazette" },
  { value: "newspaper", label: "Newspaper" },
  { value: "email_from_issuer", label: "E-mail from the issuer" },
  { value: "social_media", label: "Social media" },
  { value: "aggregator", label: "Aggregator" },
  { value: "other", label: "Other" },
];

export type EditorState = {
  category: string;
  organisation: { id: string; name: string } | null;
  title: string;
  locationIds: string[]; // the first one is the primary location
  employmentType: string;
  salaryMode: SalaryMode;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  salaryText: string;
  deadlineDay: string;
  summary: string;
  responsibilities: string;
  qualifications: string;
  applyMethod: ApplyMethod;
  applyUrl: string;
  applyEmail: string;
  applySubject: string;
  applyInstructions: string;
  sourceUrl: string;
  sourceKind: string;
  sourceReference: string;
  /** When the editor looked at the primary source; empty means "today, for a new or changed source". */
  sourceObservedOn: string;
  /** Sources other than the primary one are kept and edited under "Source & verification". */
  otherSources: SourceRow[];
  // More details
  workMode: string;
  experienceLevel: string;
  referenceNumber: string;
  contactDetails: string;
  geographicEligibility: string;
  locationText: string;
  fundingMin: string;
  fundingMax: string;
  fundingCurrency: string;
  fundingPeriod: string;
  sectorIds: string[];
  /** Category detail inputs by field name (vacancies included), as typed. */
  detail: Record<string, string | string[]>;
  // Media & SEO
  slug: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
};

const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** The calendar day of an end-of-day Harare deadline (Harare is UTC+2 all year). */
export function dayOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "herald.co.zw" for a web address, so a source has a name without the editor typing one. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function sourceName(url: string, kind: string, reference: string): string {
  const host = url ? hostOf(url) : null;
  if (host) return host;
  return reference.trim().slice(0, 60) || SOURCE_KINDS.find((k) => k.value === kind)?.label || "Source";
}

/** Whether the category's schema has a field, so the editor shows only what its category can hold. */
export const hasDetail = (category: StaffCategory | undefined, name: string): boolean =>
  Boolean(category?.detail_fields.some((f) => f.name === name));

/** Detail fields shown under "More details": everything except the one promoted to the main form. */
export const moreDetailFields = (category: StaffCategory | undefined): DetailField[] =>
  (category?.detail_fields ?? []).filter((f) => f.name !== "vacancies");

function detailToText(
  fields: DetailField[],
  detail: Record<string, unknown>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    const v = detail[f.name];
    if (v === undefined || v === null) continue;
    if (f.type === "array" && f.item_enum) out[f.name] = Array.isArray(v) ? (v as string[]) : [];
    else if (f.type === "array") out[f.name] = Array.isArray(v) ? (v as string[]).join("\n") : "";
    else if (f.type === "boolean") out[f.name] = v === true ? "yes" : "no";
    else if (f.type === "object") out[f.name] = JSON.stringify(v);
    else if (f.format === "date-time" && typeof v === "string") out[f.name] = v.slice(0, 16);
    else out[f.name] = String(v);
  }
  return out;
}

export function emptyState(category: string): EditorState {
  return {
    category,
    organisation: null,
    title: "",
    locationIds: [],
    employmentType: "",
    salaryMode: "none",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "USD",
    salaryPeriod: "month",
    salaryText: "",
    deadlineDay: "",
    summary: "",
    responsibilities: "",
    qualifications: "",
    applyMethod: "external_url",
    applyUrl: "",
    applyEmail: "",
    applySubject: "",
    applyInstructions: "",
    sourceUrl: "",
    sourceKind: "issuer_website",
    sourceReference: "",
    sourceObservedOn: "",
    otherSources: [],
    workMode: "",
    experienceLevel: "",
    referenceNumber: "",
    contactDetails: "",
    geographicEligibility: "",
    locationText: "",
    fundingMin: "",
    fundingMax: "",
    fundingCurrency: "USD",
    fundingPeriod: "",
    sectorIds: [],
    detail: {},
    slug: "",
    seoTitle: "",
    seoDescription: "",
    ogTitle: "",
    ogDescription: "",
  };
}

/** The editor's state for an existing draft: what is stored is shown exactly as stored. */
export function stateFromDraft(
  content: DraftContent,
  category: StaffCategory,
  organisation: { id: string; name: string },
): EditorState {
  const s = emptyState(category.code);
  s.organisation = organisation;
  s.title = content.title;
  s.locationIds = [...content.locations]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((l) => l.location_id);
  s.employmentType = content.employment_type ?? "";
  const pay = content.salary;
  if (content.salary_text) {
    s.salaryMode = "text";
    s.salaryText = content.salary_text;
  } else if (pay && (pay.min || pay.max)) {
    s.salaryMode = pay.min && pay.max && pay.min !== pay.max ? "range" : "amount";
    s.salaryMin = pay.min ?? pay.max ?? "";
    s.salaryMax = pay.min && pay.max && pay.min !== pay.max ? pay.max : "";
    s.salaryCurrency = pay.currency ?? "USD";
    s.salaryPeriod = pay.period ?? "month";
  }
  s.deadlineDay = dayOf(content.deadline_at);
  s.summary = content.summary;
  s.responsibilities = content.description_md;
  s.qualifications = content.requirements_md ?? "";
  s.applyMethod = (content.application_method as ApplyMethod) ?? "external_url";
  s.applyUrl = content.application_url ?? "";
  s.applyEmail = content.application_email ?? "";
  s.applySubject = content.application_email_subject ?? "";
  s.applyInstructions = content.application_instructions ?? "";
  const primary = content.sources.find((x) => x.is_primary) ?? content.sources[0];
  if (primary) {
    s.sourceUrl = primary.url ?? "";
    s.sourceKind = primary.kind;
    s.sourceReference = primary.citation ?? "";
    s.sourceObservedOn = primary.observed_on;
  }
  s.otherSources = content.sources.filter((x) => x !== primary);
  s.workMode = content.work_mode ?? "";
  s.experienceLevel = content.experience_level ?? "";
  s.referenceNumber = content.reference_number ?? "";
  s.contactDetails = content.contact_details ?? "";
  s.geographicEligibility = content.geographic_eligibility ?? "";
  s.locationText = content.location_text ?? "";
  s.fundingMin = content.funding?.min ?? "";
  s.fundingMax = content.funding?.max ?? "";
  s.fundingCurrency = content.funding?.currency ?? "USD";
  s.fundingPeriod = content.funding?.period ?? "";
  s.sectorIds = content.sector_ids;
  s.detail = detailToText(category.detail_fields, content.detail);
  s.slug = content.slug ?? "";
  s.seoTitle = content.seo_title ?? "";
  s.seoDescription = content.seo_description ?? "";
  s.ogTitle = content.og_title ?? "";
  s.ogDescription = content.og_description ?? "";
  return s;
}

/** Category detail inputs to the stored object. Only what the editor filled in is sent. */
export function detailFromText(
  fields: DetailField[],
  raw: Record<string, string | string[]>,
): { detail: Record<string, unknown>; errors: Record<string, string[]> } {
  const detail: Record<string, unknown> = {};
  const errors: Record<string, string[]> = {};
  for (const f of fields) {
    const value = raw[f.name];
    if (value === undefined) continue;
    const text = Array.isArray(value) ? "" : value.trim();
    if (f.type === "array" && f.item_enum) {
      if (Array.isArray(value) && value.length) detail[f.name] = value;
    } else if (f.type === "array") {
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) detail[f.name] = lines;
    } else if (f.type === "boolean") {
      if (text === "yes") detail[f.name] = true;
      if (text === "no") detail[f.name] = false;
    } else if (f.type === "integer" || f.type === "number") {
      if (text !== "") detail[f.name] = Number(text);
    } else if (f.type === "object") {
      if (text !== "") {
        try {
          detail[f.name] = JSON.parse(text);
        } catch {
          errors[`detail.${f.name}`] = [
            'Enter valid JSON, for example {"amount": "50.00", "currency": "USD"}.',
          ];
        }
      }
    } else if (text !== "") {
      detail[f.name] =
        f.format === "date-time" && !text.includes("+") && !text.endsWith("Z") ? `${text}:00+02:00` : text;
    }
  }
  return { detail, errors };
}

/**
 * The request body for a draft. `existing` is what is stored now: the deadline is only rewritten when the day
 * changed, skills (not edited here) go back unchanged, and a published address is never sent.
 */
export function buildContent(
  state: EditorState,
  category: StaffCategory,
  existing: DraftContent | null,
  options: { today: string; addressLocked: boolean },
): { content: Record<string, unknown>; errors: Record<string, string[]> } {
  const pays = PAY_CATEGORIES.includes(category.code);
  const { detail, errors } = detailFromText(category.detail_fields, state.detail);

  const money = (min: string, max: string, currency: string, period: string) =>
    min.trim() === "" && max.trim() === ""
      ? null
      : { min: orNull(min), max: orNull(max), currency: orNull(currency), period: orNull(period) };
  let salary: ReturnType<typeof money> = null;
  let salaryText: string | null = null;
  if (pays) {
    if (state.salaryMode === "amount")
      salary = money(state.salaryMin, state.salaryMin, state.salaryCurrency, state.salaryPeriod);
    else if (state.salaryMode === "range")
      salary = money(state.salaryMin, state.salaryMax, state.salaryCurrency, state.salaryPeriod);
    else if (state.salaryMode === "text") salaryText = orNull(state.salaryText);
  }

  const method = state.applyMethod;
  const wantsUrl = method === "external_url" || method === "both";
  const wantsEmail = method === "email" || method === "both";

  const primaryUrl = state.sourceUrl.trim();
  const primaryReference = state.sourceReference.trim();
  const previous = existing?.sources.find((x) => x.is_primary) ?? existing?.sources[0];
  const sources: Record<string, unknown>[] = [];
  if (primaryUrl || primaryReference) {
    const unchanged =
      previous && (previous.url ?? "") === primaryUrl && (previous.citation ?? "") === primaryReference;
    sources.push({
      kind: state.sourceKind,
      name: sourceName(primaryUrl, state.sourceKind, primaryReference),
      url: orNull(primaryUrl),
      citation: orNull(primaryReference),
      // "Checked on" is when the editor looked at this source: today for a new or changed link.
      observed_on: state.sourceObservedOn || (unchanged && previous ? previous.observed_on : options.today),
      is_primary: true,
    });
  }
  for (const other of state.otherSources)
    sources.push({
      kind: other.kind,
      name: other.name,
      url: orNull(other.url ?? ""),
      citation: orNull(other.citation ?? ""),
      observed_on: other.observed_on || options.today,
      is_primary: false,
    });

  const content: Record<string, unknown> = {
    title: state.title.trim(),
    summary: state.summary.trim(),
    description_md: state.responsibilities.trim(),
    requirements_md: orNull(state.qualifications),
    organisation_id: state.organisation?.id,
    locations: state.locationIds.map((id, index) => ({ location_id: id, is_primary: index === 0 })),
    employment_type: orNull(state.employmentType),
    work_mode: orNull(state.workMode),
    experience_level: orNull(state.experienceLevel),
    location_text: orNull(state.locationText),
    geographic_eligibility: orNull(state.geographicEligibility),
    reference_number: orNull(state.referenceNumber),
    contact_details: orNull(state.contactDetails),
    application_method: method,
    application_url: wantsUrl ? orNull(state.applyUrl) : null,
    application_email: wantsEmail ? orNull(state.applyEmail) : null,
    application_email_subject: wantsEmail ? orNull(state.applySubject) : null,
    application_instructions: orNull(state.applyInstructions),
    sector_ids: state.sectorIds,
    sources,
    detail,
    seo_title: orNull(state.seoTitle),
    seo_description: orNull(state.seoDescription),
    og_title: orNull(state.ogTitle),
    og_description: orNull(state.ogDescription),
  };
  if (pays) {
    content.salary = salary;
    content.salary_text = salaryText;
  } else {
    content.funding = money(state.fundingMin, state.fundingMax, state.fundingCurrency, state.fundingPeriod);
  }
  if (existing)
    content.skills = existing.skills.map((s) => ({ skill_id: s.skill_id, is_required: s.is_required }));
  if (!options.addressLocked) content.slug = orNull(state.slug);

  const keepDeadline = existing
    ? state.deadlineDay === dayOf(existing.deadline_at)
    : state.deadlineDay === "";
  if (!keepDeadline) {
    content.deadline_at = state.deadlineDay ? `${state.deadlineDay}T23:59:59+02:00` : null;
    content.deadline_timezone = state.deadlineDay ? "Africa/Harare" : null;
    content.deadline_is_date_only = Boolean(state.deadlineDay);
  }
  return { content, errors };
}

/** Prefix each selected line with "- " (or remove it when every line already has one): the bullet-list helper. */
export function toggleBullets(
  text: string,
  start: number,
  end: number,
): { text: string; start: number; end: number } {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const all = lines.every((l) => l.trim() === "" || /^\s*[-*]\s/.test(l));
  const changed = lines
    .map((l) =>
      l.trim() === "" ? l : all ? l.replace(/^(\s*)[-*]\s/, "$1") : `- ${l.replace(/^\s*[-*]\s/, "")}`,
    )
    .join("\n");
  const next = text.slice(0, lineStart) + changed + text.slice(lineEnd);
  return { text: next, start: lineStart, end: lineStart + changed.length };
}

/** Whether the editor has enough to create a draft: a category, an organisation and a title. */
export const canCreate = (s: EditorState): boolean => Boolean(s.category && s.organisation && s.title.trim());
