/** Shapes returned by the public catalogue API (docs/engineering/openapi/openapi.yaml). */
export type Category = { code: string; name: string };
export type Location = { id: string; slug: string; name: string; kind: string; parent_slug: string | null };
export type Sector = { id: string; slug: string; name: string };
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
  organisation: {
    id: string;
    name: string;
    profile_slug?: string | null;
    website_url?: string | null;
    logo?: string | null;
  };
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

export type ListingImage = {
  url: string;
  width: number;
  height: number;
  content_type: string;
  alt: string;
};

export type OpportunityDetail = OpportunitySummary & {
  og_title: string;
  og_description: string;
  featured_image: ListingImage | null;
  social_image: ListingImage | null;
  description_html: string;
  responsibilities_html: string | null;
  requirements_html: string | null;
  seo_title: string | null;
  seo_description: string | null;
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
