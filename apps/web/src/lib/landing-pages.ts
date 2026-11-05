/**
 * The organic landing pages (`/jobs/<slug>`, D-68): one fixed page per collection the API defines
 * (`apps/api/opportunities/collections.py`; a test on each side pins the slugs). Each page says in plain words which
 * listings it holds and how they were chosen, and nothing the data does not back: no counts, salaries, employers or
 * "best" claims are written here; the listings below the text are the real, open ones.
 *
 * Indexing (SEO-B10): a landing page is offered to search engines only while it holds at least
 * `LANDING_MIN_LISTINGS` open listings. With fewer it is still useful to a visitor who arrives by a link, but it is
 * `noindex, follow` and left out of the sitemap, so search engines never receive an almost empty page (no doorway or
 * thin pages). Later pages (`?cursor=`) are noindex, follow and canonical to themselves, like the main list.
 */
export const LANDING_MIN_LISTINGS = 3;

export type LandingPage = {
  slug: string;
  /** <title> (the site name is appended by the layout). */
  title: string;
  heading: string;
  description: string;
  /** What the page holds and how a listing gets onto it. */
  intro: string;
  /** The nearest broader list, offered when this page has few listings. */
  broader: { href: string; label: string };
};

export const LANDING_PAGES = {
  harare: {
    slug: "harare",
    title: "Jobs in Harare",
    heading: "Jobs in Harare",
    description:
      "Open jobs, internships and graduate programmes in Harare, each reviewed before it is published and shown with a clear verification label.",
    intro:
      "Jobs, internships and graduate programmes that the employer places in Harare or Harare Province. A listing leaves this page when its closing date passes or the issuer withdraws it.",
    broader: { href: "/opportunities?category=jobs", label: "All jobs in Zimbabwe" },
  },
  bulawayo: {
    slug: "bulawayo",
    title: "Jobs in Bulawayo",
    heading: "Jobs in Bulawayo",
    description:
      "Open jobs, internships and graduate programmes in Bulawayo, each reviewed before it is published and shown with a clear verification label.",
    intro:
      "Jobs, internships and graduate programmes that the employer places in Bulawayo or Bulawayo Province. A listing leaves this page when its closing date passes or the issuer withdraws it.",
    broader: { href: "/opportunities?category=jobs", label: "All jobs in Zimbabwe" },
  },
  "graduate-trainee": {
    slug: "graduate-trainee",
    title: "Graduate Trainee Jobs in Zimbabwe",
    heading: "Graduate trainee jobs in Zimbabwe",
    description:
      "Open graduate trainee programmes and entry-level jobs in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
    intro:
      "Graduate trainee and other structured graduate programmes, together with jobs whose stated experience level is entry level. Check each listing for the qualifications and the year of graduation it asks for. Internships for students are listed separately.",
    broader: { href: "/opportunities?category=graduate-programmes", label: "All graduate programmes" },
  },
  engineering: {
    slug: "engineering",
    title: "Engineering Jobs in Zimbabwe",
    heading: "Engineering jobs in Zimbabwe",
    description:
      "Open engineering jobs, internships and graduate programmes in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
    intro:
      "Jobs, internships and graduate programmes in the engineering sector, and those whose title names an engineer or engineering role. Each listing states the discipline and the registration or qualifications it asks for.",
    broader: { href: "/opportunities?category=jobs", label: "All jobs in Zimbabwe" },
  },
  "finance-and-accounting": {
    slug: "finance-and-accounting",
    title: "Finance and Accounting Jobs in Zimbabwe",
    heading: "Finance and accounting jobs in Zimbabwe",
    description:
      "Open finance, banking and accounting jobs, internships and graduate programmes in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
    intro:
      "Jobs, internships and graduate programmes in the finance and banking sector, and those whose title names an accounts, accountant or accounting role in any sector.",
    broader: { href: "/opportunities?category=jobs", label: "All jobs in Zimbabwe" },
  },
  ngo: {
    slug: "ngo",
    title: "NGO Jobs and Vacancies in Zimbabwe",
    heading: "NGO jobs and vacancies in Zimbabwe",
    description:
      "Open jobs, internships and graduate programmes with NGOs and development organisations in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
    intro:
      "Jobs, internships and graduate programmes that staff have placed in the NGO and development sector. Funding, grants and tenders from development organisations are listed in their own categories.",
    broader: { href: "/opportunities?category=jobs", label: "All jobs in Zimbabwe" },
  },
} as const satisfies Record<string, LandingPage>;

export type LandingSlug = keyof typeof LANDING_PAGES;
export const LANDING_SLUGS = Object.keys(LANDING_PAGES) as LandingSlug[];

export function landingPage(slug: string): LandingPage | undefined {
  return Object.hasOwn(LANDING_PAGES, slug) ? LANDING_PAGES[slug as LandingSlug] : undefined;
}

export const landingPath = (slug: string) => `/jobs/${slug}`;
