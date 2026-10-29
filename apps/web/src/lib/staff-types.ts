/** Shapes returned by the staff API (`/api/v1/staff/`, docs/engineering/STAFF_API.md). */

export type StaffSession = {
  user: { id: string; email: string; display_name: string };
  roles: string[];
  permissions: string[];
  mfa: { required: boolean; verified: boolean; enrolled: boolean };
  session: { idle_seconds: number; absolute_seconds: number };
};

export type Page = { number: number; size: number; total: number; pages: number };
export type Paged<T> = { data: T[]; page: Page };

export type ListingStatus =
  "draft" | "in_review" | "approved" | "rejected" | "published" | "expired" | "withdrawn" | "archived";

export type OpportunityRow = {
  id: string;
  title: string;
  organisation: { id: string; name: string; verified: boolean };
  category: { code: string; name: string };
  location: string | null;
  status: ListingStatus;
  version_state: string;
  closing: { at: string | null; timezone: string | null; is_date_only: boolean };
  author: { id: string; name: string };
  authored_by_you: boolean;
  employer_owned: boolean;
  direct_publication: boolean;
  slug: string | null;
  row_version: number;
  updated_at: string | null;
  actions: string[];
};

export type Money = {
  min: string | null;
  max: string | null;
  currency: string | null;
  period?: string | null;
};

export type SourceInput = {
  kind: string;
  name: string;
  url: string | null;
  citation: string | null;
  observed_on: string;
  is_primary: boolean;
};

export type DraftContent = {
  organisation_id: string;
  title: string;
  summary: string;
  description_md: string;
  requirements_md: string | null;
  locations: { location_id: string; name?: string; is_primary: boolean }[];
  location_text: string | null;
  geographic_eligibility: string | null;
  work_mode: string | null;
  employment_type: string | null;
  experience_level: string | null;
  salary: Money | null;
  funding: Money | null;
  deadline_at: string | null;
  deadline_timezone: string | null;
  deadline_is_date_only: boolean;
  application_method: string;
  application_url: string | null;
  application_email: string | null;
  application_instructions: string | null;
  reference_number: string | null;
  contact_details: string | null;
  skills: { skill_id: string; name?: string; is_required: boolean }[];
  sector_ids: string[];
  sources: SourceInput[];
  detail: Record<string, unknown>;
};

type Person = { id: string; name: string } | null;

export type OpportunityDetail = OpportunityRow & {
  version: {
    id: string;
    number: number;
    state: string;
    author: Person;
    submitted_by: Person;
    approved_by: Person;
    published_by: Person;
    direct_publication: boolean;
  };
  content: DraftContent;
  has_live_version: boolean;
  public_path: string | null;
  verification: {
    level: "not_verified" | "source_checked" | "issuer_verified";
    checked_at: string | null;
    can_record: boolean;
    records: {
      id: string;
      level: string;
      method: string;
      outcome: string;
      evidence_note: string;
      checked_by: Person;
      checked_at: string | null;
      version_no: number;
    }[];
  };
  decisions: {
    decision: string;
    reason: string | null;
    reason_code: string | null;
    checklist: Record<string, unknown>;
    decided_by: Person;
    decided_at: string | null;
    version_no: number;
  }[];
  history: {
    transition: string;
    label: string;
    from_status: string;
    to_status: string;
    actor: Person;
    reason: string | null;
    at: string | null;
  }[];
};

export type Choice = { value: string; label: string };
export type StaffReference = {
  categories: { code: string; name: string }[];
  locations: { id: string; name: string; kind: string }[];
  sectors: { id: string; name: string }[];
  choices: Record<
    | "work_mode"
    | "employment_type"
    | "experience_level"
    | "salary_period"
    | "application_method"
    | "source_kind"
    | "verification_level"
    | "verification_method"
    | "verification_outcome",
    Choice[]
  >;
  currencies: string[];
  timezone: string;
};

export type SchemaProperty = {
  type?: string | string[];
  enum?: (string | null)[];
  items?: { type?: string; enum?: string[]; maxLength?: number };
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
  title?: string;
};
export type CategorySchema = {
  category: string;
  required: string[];
  properties: Record<string, SchemaProperty>;
  applicable: {
    employment_types: string[] | null;
    work_mode: boolean;
    experience_level: boolean;
    salary: boolean;
    funding: boolean;
    deadline_required: boolean;
  };
};

export type Overview = {
  counts: Record<string, number | null>;
  activity: { opportunity_id: string; title: string; label: string; actor: string; at: string | null }[];
};

export type OrganisationRow = {
  id: string;
  name: string;
  website_url: string | null;
  verified: boolean;
  verification: { method: string; verified_at: string | null } | null;
  origin: "verified_employer" | "entered_by_staff";
  listings: number;
  created_at: string | null;
  row_version: number;
};

export type ClaimRow = {
  id: string;
  claimant: { id: string; name: string };
  organisation_name: string;
  organisation_id: string | null;
  website_url: string | null;
  registration_number: string | null;
  role_title: string;
  evidence_note: string;
  status: string;
  created_at: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  already_verified: boolean;
};

export type ReportRow = {
  id: string;
  reference: string;
  reason: string;
  reason_label: string;
  status: string;
  resolution: string;
  opportunity: { id: string; title: string; slug: string | null };
  duplicate_count: number;
  assigned_to: string | null;
  created_at: string | null;
  row_version: number;
};
export type ReportDetail = ReportRow & {
  details: string;
  evidence_url: string | null;
  contact_email: string | null;
  is_participant: boolean;
  events: {
    action: string;
    label: string;
    actor: string;
    from_status: string;
    to_status: string;
    note: string;
    at: string | null;
  }[];
};

export type StaffAccount = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  roles: string[];
  two_step_enrolled: boolean;
  created_at: string | null;
};

export type AuditRow = {
  id: number;
  at: string | null;
  action: string;
  severity: string;
  actor_type: string;
  actor: string | null;
  actor_id: string | null;
  object_type: string;
  object_id: string | null;
  request_id: string;
  changes: Record<string, unknown> | null;
};

export type StaffSettings = {
  brand: { name: string; short: string };
  security: { staff_two_step_required: boolean; staff_idle_minutes: number; staff_session_hours: number };
  email: { provider: string; delivery_verified: boolean };
  taxonomies: { categories: number; locations: number; sectors: number };
  totals: { listings: number; published: number };
};
