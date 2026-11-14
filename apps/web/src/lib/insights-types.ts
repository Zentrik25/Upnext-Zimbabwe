/** Career Insights (D-78): the shapes the API returns. Public types describe the live snapshot only. */

export type InsightsCategoryRef = { slug: string; name: string };

export type ArticleCard = {
  slug: string;
  headline: string;
  summary: string;
  category: InsightsCategoryRef | null;
  /** `slug` is set only when the author has a public archive (enough published articles). */
  author: { name: string; slug: string | null };
  published_at: string | null;
  /** The last change of the published text; null until the first publication. */
  updated_at: string | null;
  reading_minutes: number;
  image: { url: string; alt: string } | null;
};

export type ArticleSource = {
  title: string;
  publisher: string;
  url: string;
  published_on: string | null;
  accessed_on: string | null;
};

export type ArticleDetail = Omit<ArticleCard, "image" | "author"> & {
  author: {
    name: string;
    slug: string | null;
    bio?: string | null;
    expertise?: string[];
    image?: string | null;
  };
  image: { url: string; alt: string; caption: string; credit: string } | null;
  body_html: string;
  in_short: string[];
  why_it_matters: string;
  tags: InsightsCategoryRef[];
  sources: ArticleSource[];
  canonical_url: string | null;
  seo: {
    title: string | null;
    description: string | null;
    social_title: string | null;
    social_description: string | null;
    social_image: string | null;
  };
  opportunity_categories: string[];
  word_count: number;
  related: ArticleCard[];
  /** Only on a staff preview. */
  status?: string;
};

export type InsightsCategory = {
  slug: string;
  name: string;
  description: string;
  seo_title: string | null;
  seo_description: string | null;
  count: number;
  updated_at: string | null;
};

export type InsightsHome = {
  featured: ArticleCard | null;
  top_story: ArticleCard | null;
  carousel: ArticleCard[];
  latest: ArticleCard[];
  graduate: ArticleCard[];
  categories: InsightsCategory[];
  total: number;
  has_articles: boolean;
};

export type ArticlePage = {
  data: ArticleCard[];
  page: { page: number; pages: number; total: number; limit: number };
};

export type InsightsAuthor = {
  name: string;
  slug: string;
  bio: string | null;
  expertise: string[];
  image: string | null;
  articles: ArticleCard[];
};

export type InsightsSitemap = {
  articles: { slug: string; updated_at: string | null }[];
  categories: { slug: string; updated_at: string | null }[];
  authors: { slug: string }[];
  updated_at: string | null;
};

// --- staff -------------------------------------------------------------------------------------------------------
export type ArticleStatus = "draft" | "submitted" | "in_review" | "approved" | "published" | "archived";
export type ArticleAction =
  "save" | "submit" | "start_review" | "approve" | "reject" | "return" | "publish" | "archive" | "placement";

export type Person = { id: string; name: string };

export type StaffArticleRow = {
  id: string;
  headline: string;
  slug: string;
  status: ArticleStatus;
  category: InsightsCategoryRef | null;
  author: Person | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  live: boolean;
  live_slug: string | null;
  is_featured: boolean;
  is_carousel: boolean;
  is_top_story: boolean;
  actions: ArticleAction[];
};

export type StaffArticle = StaffArticleRow & {
  row_version: number;
  summary: string;
  body_html: string;
  in_short: string[];
  why_it_matters: string;
  sources: ArticleSource[];
  tags: string[];
  featured_image: string | null;
  featured_image_url: string | null;
  image_alt: string;
  image_caption: string;
  image_credit: string;
  opportunity_categories: string[];
  canonical_url: string;
  search_title: string;
  search_description: string;
  social_title: string;
  social_description: string;
  social_image: string | null;
  social_image_url: string | null;
  public_url: string;
  reading_minutes: number;
  word_count: number;
  created_by: Person | null;
  submitted_by: Person | null;
  approved_by: Person | null;
  approval_valid: boolean;
  last_review: { decision: string; note: string; by: string; at: string } | null;
};

export type InsightsMeta = {
  categories: InsightsCategoryRef[];
  opportunity_categories: { code: string; name: string }[];
  checklist: { key: string; label: string }[];
  writers: Person[];
  permissions: { write: boolean; review: boolean; publish: boolean; manage: boolean };
  limits: Record<string, number>;
};

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "Pending review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};
