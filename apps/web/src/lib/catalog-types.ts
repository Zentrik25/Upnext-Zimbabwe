/** Shapes returned by the public catalogue API (docs/engineering/openapi/openapi.yaml). */
export type Category = { code: string; name: string };
export type Location = { id: string; slug: string; name: string; kind: string; parent_slug: string | null };
export type DeadlineState = "open" | "closing_soon" | "unknown" | "expired";
export type Deadline = {
  at: string | null;
  timezone: string | null;
  is_date_only: boolean;
  state: DeadlineState;
};
export type Money = { min: string | null; max: string | null; currency: string; period: string | null };
export type VerificationLevel = "not_verified" | "source_checked" | "issuer_verified";
export type ListingStatus = "published" | "expired" | "withdrawn";

export type OpportunitySummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: Category;
  organisation: { id: string; name: string };
  locations: { slug: string; name: string; is_primary: boolean }[];
  work_mode: string | null;
  employment_type: string | null;
  deadline: Deadline;
  salary: Money | null;
  verification: { level: VerificationLevel; checked_at: string | null };
  primary_source_name: string | null;
  status: ListingStatus;
  published_at: string;
  is_saved: boolean | null;
};

export type Source = {
  kind: string;
  name: string;
  url: string | null;
  citation: string | null;
  observed_on: string;
  is_primary: boolean;
};

export type OpportunityDetail = OpportunitySummary & {
  description_html: string;
  requirements_html: string | null;
  geographic_eligibility: string | null;
  location_text: string | null;
  experience_level: string | null;
  funding: Money | null;
  skills: { name: string; is_required: boolean }[];
  sectors: { id: string; slug: string; name: string }[];
  reference_number: string | null;
  contact_details: string | null;
  application: {
    method: "external_url" | "email" | "instructions";
    url: string | null;
    email: string | null;
    instructions: string | null;
  };
  sources: Source[];
  detail: Record<string, unknown>;
  detail_schema_version: number;
  canonical_path: string;
  updated_at: string;
};

export type Page = { limit: number; has_more: boolean; next_cursor: string | null; total: number | null };
