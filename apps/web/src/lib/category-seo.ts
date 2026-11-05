import { CATEGORY_SUMMARY } from "./filters";

/**
 * Search copy for the six launch categories, by category code. Only categories that exist in the catalogue get a
 * page of their own in search (a filtered list address, not a new route): an unknown code is treated like any other
 * filter and stays out of the index. The wording says what the category holds and nothing the data does not back
 * (category definitions: `CATEGORY_SUMMARY` and the category schemas). Titles name the eight priority destinations
 * (D-69): "Latest jobs", "Latest tenders", "Internships & attachments", "Graduate trainee programmes",
 * "Scholarships & fellowships". The description is also shown under the heading, so each list has text of its own.
 */
export const CATEGORY_SEO: Record<string, { title: string; heading: string; description: string }> = {
  jobs: {
    title: "Latest Jobs in Zimbabwe",
    heading: "Latest jobs in Zimbabwe",
    description:
      "The latest vacancies in Zimbabwe: permanent, contract and part-time jobs, each reviewed before it is published and shown with a clear verification label.",
  },
  internships: {
    title: "Internships & Attachments in Zimbabwe",
    heading: "Internships and attachments in Zimbabwe",
    description:
      "Internships, industrial attachments and apprenticeships in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
  },
  "graduate-programmes": {
    title: "Graduate Trainee Programmes in Zimbabwe",
    heading: "Graduate trainee programmes in Zimbabwe",
    description:
      "Graduate trainee and other structured entry-level programmes in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
  },
  scholarships: {
    title: "Scholarships & Fellowships",
    heading: "Scholarships and fellowships",
    // The category holds funding for study and research, postdoctoral included (scholarships schema v1).
    description:
      "Scholarships, bursaries and research fellowships for study in Zimbabwe and abroad, each reviewed before it is published and shown with a clear verification label.",
  },
  tenders: {
    title: "Latest Tenders in Zimbabwe",
    heading: "Latest tenders and procurement notices",
    description:
      "The latest tenders, procurement notices and requests for quotations in Zimbabwe, each reviewed before it is published and shown with a clear verification label.",
  },
  grants: {
    title: "Grants & Funding Opportunities in Zimbabwe",
    heading: "Grants and funding opportunities",
    description: `${CATEGORY_SUMMARY.grants} Every listing carries a clear verification label.`,
  },
};
