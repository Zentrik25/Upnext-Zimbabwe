import { CATEGORY_SUMMARY } from "./filters";

/**
 * Search copy for the six launch categories, by category code. Only categories that exist in the catalogue get a
 * page of their own in search (a filtered list address, not a new route): an unknown code is treated like any other
 * filter and stays out of the index. The wording says what the category holds and nothing the data does not back.
 */
export const CATEGORY_SEO: Record<string, { title: string; heading: string; description: string }> = {
  jobs: {
    title: "Latest Jobs in Zimbabwe",
    heading: "Jobs in Zimbabwe",
    description: `${CATEGORY_SUMMARY.jobs} Every listing names its source and carries a clear verification label.`,
  },
  internships: {
    title: "Internships in Zimbabwe",
    heading: "Internships in Zimbabwe",
    description: `${CATEGORY_SUMMARY.internships} Every listing names its source and carries a clear verification label.`,
  },
  "graduate-programmes": {
    title: "Graduate Programmes in Zimbabwe",
    heading: "Graduate programmes in Zimbabwe",
    description: `${CATEGORY_SUMMARY["graduate-programmes"]} Every listing names its source and carries a clear verification label.`,
  },
  scholarships: {
    title: "Scholarships & Education Opportunities",
    heading: "Scholarships and education opportunities",
    description: `${CATEGORY_SUMMARY.scholarships} Every listing names its source and carries a clear verification label.`,
  },
  tenders: {
    title: "Tenders & Procurement Notices in Zimbabwe",
    heading: "Tenders and procurement notices",
    description: `${CATEGORY_SUMMARY.tenders} Every listing names its source and carries a clear verification label.`,
  },
  grants: {
    title: "Grants & Funding Opportunities in Zimbabwe",
    heading: "Grants and funding opportunities",
    description: `${CATEGORY_SUMMARY.grants} Every listing names its source and carries a clear verification label.`,
  },
};
