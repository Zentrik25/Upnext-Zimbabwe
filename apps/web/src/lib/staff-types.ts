/** Shapes returned by the staff API (`/api/v1/staff/`, D-49). Mirrors apps/api/api/staff_views.py. */

export type StaffSession = {
  user: { id: string; name: string; role: string; roles: string[] };
  two_step: { required: boolean; verified: boolean; enrolled: boolean };
  public_url: string;
  permissions?: string[];
  attention?: AttentionRow[];
  task_total?: number;
};

export type AttentionRow = {
  key: string;
  label: string;
  count: number;
  icon: string;
  actionable: boolean;
  href: string;
};

export type Kpi = { key: string; label: string; value: number; note: string; href: string; icon: string };

export type ActivityItem = { subject: string; verb: string; actor: string; when: string; href: string };

export type StatusTone = "neutral" | "warning" | "info" | "danger" | "success" | "muted";

export type StaffAction = {
  name: string;
  label: string;
  description?: string;
  fields?: ActionField[];
};

export type ActionField = {
  name: string;
  label: string;
  kind: "boolean" | "choice" | "integer" | "textarea" | "text" | "reference";
  /** For `reference` fields: what to search (`organisations` or `locations`). */
  lookup?: string | null;
  required: boolean;
  help: string;
  choices: { value: string; label: string }[] | null;
  min_length: number | null;
};

export type ListingRow = {
  id: string;
  title: string;
  organisation: string | null;
  location: string;
  category: { code: string; name: string };
  closing: string | null;
  status: string;
  status_label: string;
  status_tone: StatusTone;
  version_state: string | null;
  verification: string;
  verification_label: string;
  submitted_by: string | null;
  submitted_at: string | null;
  updated_at: string;
  row_version: number;
  actions: { name: string; label: string }[];
};

export type Dashboard = {
  kpis: Kpi[];
  attention: AttentionRow[];
  activity: ActivityItem[];
  listings: ListingRow[];
};

export type PageInfo = { page: number; page_size: number; total: number; pages: number };

export type ListingList = {
  data: ListingRow[];
  page: PageInfo;
  counts: Record<string, number>;
};

export type SourceRow = {
  kind: string;
  name: string;
  url: string | null;
  citation: string | null;
  observed_on: string;
  is_primary: boolean;
};

export type Money = {
  min: string | null;
  max: string | null;
  currency: string | null;
  period: string | null;
};

export type DraftContent = {
  title: string;
  summary: string;
  description_md: string;
  requirements_md: string | null;
  locations: { location_id: string; name: string; is_primary: boolean }[];
  location_text: string | null;
  geographic_eligibility: string | null;
  work_mode: string | null;
  employment_type: string | null;
  experience_level: string | null;
  salary: Money | null;
  salary_text: string | null;
  funding: Money | null;
  deadline_at: string | null;
  deadline_timezone: string | null;
  deadline_is_date_only: boolean;
  application_method: string;
  application_url: string | null;
  application_email: string | null;
  application_email_subject: string | null;
  application_instructions: string | null;
  reference_number: string | null;
  contact_details: string | null;
  skills: { skill_id: string; name: string; is_required: boolean }[];
  sector_ids: string[];
  sectors: { id: string; name: string }[];
  sources: SourceRow[];
  detail: Record<string, unknown>;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
};

export type VersionView =
  | { hidden: true; state: string; message: string }
  | {
      hidden: false;
      id: string;
      version_no: number;
      state: string;
      author: string;
      submitted_by: string | null;
      submitted_at: string | null;
      approved_by: string | null;
      approved_at: string | null;
      fingerprint: string | null;
      organisation: { id: string; name: string };
      content: DraftContent;
    };

export type ListingDetail = ListingRow & {
  slug: string | null;
  public_path: string | null;
  pending: VersionView | null;
  live: VersionView | null;
  history: {
    what: string;
    from_status: string;
    to_status: string;
    actor: string;
    reason: string | null;
    at: string;
  }[];
  verifications: {
    version_no: number;
    level: string;
    method: string;
    outcome: string;
    evidence_note: string;
    checked_by: string;
    checked_at: string;
  }[];
  actions: StaffAction[];
  warnings: string[];
  can_edit: boolean;
};

export type DetailField = {
  name: string;
  type: string | null;
  format: string | null;
  enum: string[] | null;
  item_enum: string[] | null;
  item_type: string | null;
  max_length: number | null;
  required: boolean;
};
export type StaffCategory = { code: string; name: string; detail_fields: DetailField[] };

export type ActivityRow = {
  what: string;
  listing_id: string;
  listing: string;
  from_status: string;
  to_status: string;
  actor: string;
  at: string;
};

export type SearchGroups = {
  query: string;
  groups: { group: string; items: { label: string; hint: string; href: string }[] }[];
};

export type Cell = string | { text: string; tone: StatusTone } | null;

export type RecordList = {
  resource: { key: string; label: string; description: string };
  columns: { key: string; label: string; kind: "text" | "datetime" | "badge" }[];
  filters: { name: string; label: string; choices: { value: string; label: string }[] }[];
  searchable: boolean;
  data: { id: string; cells: Record<string, Cell> }[];
  page: PageInfo;
};

export type RecordDetail = {
  resource: { key: string; label: string };
  id: string;
  title: string;
  status: { label: string; tone: StatusTone } | null;
  facts: { label: string; value: string }[];
  sections: { title: string; headers: string[]; rows: { href?: string; cells: string[] }[] }[];
  notice: string | null;
  row_version: number | null;
  actions: StaffAction[];
};

export type CatalogKind = { key: string; label: string; description: string; can_add: boolean };

export type CatalogList = {
  kind: { key: string; label: string; description: string };
  columns: { key: string; label: string }[];
  can_add: boolean;
  fields: ActionField[];
  data: { id: string; cells: Record<string, string> }[];
  page: PageInfo;
};

export type CatalogRecord = {
  kind: { key: string; label: string };
  id: string;
  title: string;
  values: Record<string, string | number | boolean>;
  fields: ActionField[];
  readonly: Record<string, string>;
  can_edit: boolean;
  row_version: number | null;
};

export type ContentHealth = {
  target: {
    listings: { goal: number; current_source_checked: number; current_live: number };
    issuers: { goal: number; have: number };
    categories: { goal: number; covered: number; missing: string[] };
    met: boolean;
  };
  live_per_category: { code: string; live: number }[];
  pipeline: { status: string; count: number }[];
  oldest_waiting_review_hours: number | null;
  closing_within_7_days: number;
  unknown_deadline_over_30_days: number;
  live_not_verified: number;
  sod_violations: { rule: string; version_id: string }[];
};
