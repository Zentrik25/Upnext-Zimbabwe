/** Option lists for the search filters. One source for the homepage search and the results page. */
export const EMPLOYMENT = [
  ["permanent", "Permanent"],
  ["contract", "Contract"],
  ["temporary", "Temporary"],
  ["part_time", "Part time"],
  ["internship", "Internship"],
  ["trainee", "Trainee"],
] as const;
export const MODES = [
  ["on_site", "On site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;
export const DEADLINES = [
  ["open", "Open"],
  ["closing_soon", "Closing soon"],
  ["unknown", "Deadline not stated"],
] as const;

/** What each of the six categories covers, by code. Unknown codes simply have no description. */
export const CATEGORY_SUMMARY: Record<string, string> = {
  jobs: "Vacancies, permanent, contract and part time.",
  internships: "Attachments, internships and apprenticeships.",
  "graduate-programmes": "Structured entry-level programmes.",
  scholarships: "Funding for study at home and abroad.",
  tenders: "Procurement notices and requests for quotations.",
  grants: "Funding for business, research and community work.",
};
