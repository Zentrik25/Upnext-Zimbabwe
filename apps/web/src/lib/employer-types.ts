/** Shapes returned by the employer portal API (docs/engineering/openapi/openapi.yaml, tag `employer`). */

export type ClaimStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type Claim = {
  id: string;
  organisation_name: string;
  organisation_id: string | null;
  status: ClaimStatus;
  role_title: string;
  created_at: string;
  decided_at: string | null;
  decision_reason: string | null;
};

export type EmployerOrganisation = {
  id: string;
  name: string;
  role: "owner" | "recruiter";
  verified: boolean;
  profile_slug: string | null;
  profile_pending: boolean;
  listing_count: number;
};

export type Overview = {
  account_ready: boolean;
  claims: Claim[];
  organisations: EmployerOrganisation[];
};

export type ListingStatusValue =
  "draft" | "in_review" | "approved" | "rejected" | "published" | "expired" | "withdrawn" | "archived";

export type EmployerAction = "edit" | "submit" | "discard" | "reopen" | "amend";

export type Decision = { decision: "rejected" | "returned"; reason: string | null; decided_at: string };

export type EmployerListingRow = {
  id: string;
  title: string;
  category: { code: string; name: string };
  status: ListingStatusValue;
  version_state: string;
  row_version: number;
  slug: string | null;
  updated_at: string | null;
  decision: Decision | null;
  next_actions: EmployerAction[];
};

export type ListingContent = {
  title: string;
  summary: string;
  description_md: string;
  requirements_md: string | null;
  locations: { location_id: string; slug: string; name: string; is_primary: boolean }[];
  location_text: string | null;
  work_mode: string | null;
  employment_type: string | null;
  experience_level: string | null;
  salary: { min: string | null; max: string | null; currency: string | null; period: string | null } | null;
  deadline_at: string | null;
  deadline_timezone: string | null;
  deadline_is_date_only: boolean;
  application_method: string;
  application_url: string | null;
  application_email: string | null;
  application_instructions: string | null;
  reference_number: string | null;
  detail: Record<string, unknown>;
};

export type EmployerListingDetail = EmployerListingRow & {
  organisation: { id: string; name: string };
  version_no: number;
  authored_by_you: boolean;
  content: ListingContent;
  has_live_version: boolean;
  public_path: string | null;
};

export type ProfileRevision = {
  id: string;
  version_no: number;
  state: "pending" | "approved" | "rejected" | "withdrawn" | "superseded";
  tagline: string;
  about: string;
  sector: { id: string; name: string } | null;
  size_band: string | null;
  founded_year: number | null;
  location_text: string | null;
  submitted_at: string;
  decided_at: string | null;
  decision_reason: string | null;
};

export type ProfileState = {
  organisation: { id: string; name: string };
  verified: boolean;
  can_edit: boolean;
  slug: string | null;
  live: ProfileRevision | null;
  pending: ProfileRevision | null;
  last_rejected: ProfileRevision | null;
  sectors: { id: string; name: string }[];
  size_bands: string[];
};

export type ListingStats = {
  opportunity_id: string;
  last_7_days: { views: number; apply_clicks: number };
  last_30_days: { views: number; apply_clicks: number };
  total: { views: number; apply_clicks: number };
  saves: number;
};

export type PublicProfile = {
  slug: string;
  organisation: { id: string; name: string; website_url: string | null };
  tagline: string;
  about: string;
  sector: { id: string; name: string } | null;
  size_band: string | null;
  founded_year: number | null;
  location_text: string | null;
  updated_at: string | null;
  open_listings: number;
};

/** Words for statuses: colour is never the only cue. */
export const STATUS_LABEL: Record<ListingStatusValue, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved, waiting to be published",
  rejected: "Returned with reasons",
  published: "Published",
  expired: "Closed",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

export const EMPLOYER_CATEGORIES = [
  { code: "jobs", name: "Job" },
  { code: "internships", name: "Internship" },
  { code: "graduate-programmes", name: "Graduate programme" },
] as const;
