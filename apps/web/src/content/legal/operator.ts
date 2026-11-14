/**
 * Who is behind the service, as confirmed by the owner (2026-10-29). Only confirmed facts live here. The
 * registered address, registration number, licence status and any Data Protection Officer are NOT included
 * because the owner has not supplied them; nothing is guessed (docs/legal/LEGAL_APPROVAL_CHECKLIST.md).
 */
export const OPERATOR = {
  legalName: "Zentrik Solutions (Pvt) Ltd",
  country: "Zimbabwe",
  /** General enquiries, corrections and listings. */
  generalEmail: "info@upnext.co.zw",
  /** Privacy requests and support. */
  privacyEmail: "support@upnext.co.zw",
} as const;

/**
 * Organisations related to the operator (owner decision, 2026-11-14, D-75): their vacancies stay on UPNEXT but every
 * listing from them says so, because the operator publishing its own vacancies is a relationship readers should know
 * about. Matched by name, ignoring case, punctuation and a "(Pvt) Ltd" ending, so it holds in every environment.
 */
export const OPERATOR_AFFILIATES: readonly { name: string; relationship: string }[] = [
  {
    name: "Zentrik Solutions",
    relationship: `${OPERATOR.legalName}, the employer for this vacancy, operates UPNEXT Careers.`,
  },
];

const normalise = (name: string) =>
  name
    .toLowerCase()
    .replace(/\(?\s*(pvt|private)\s*\)?\s*(ltd|limited)\.?\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The disclosure for an organisation related to the operator, or null. */
export function operatorAffiliation(organisationName: string | null | undefined): string | null {
  if (!organisationName) return null;
  const wanted = normalise(organisationName);
  return OPERATOR_AFFILIATES.find((a) => normalise(a.name) === wanted)?.relationship ?? null;
}

/**
 * Publication gate. The text itself carries no "draft" wording; whether search engines may index it is
 * decided here. It stays closed until the owner records, in the environment of the deployed site, that the
 * checklist in docs/legal/LEGAL_APPROVAL_CHECKLIST.md is complete and a qualified Zimbabwean adviser has
 * reviewed the documents. Setting the flag is the owner's act; the application never sets it.
 */
export function legalPublished(env: Record<string, string | undefined> = process.env): boolean {
  return env.UPNEXT_LEGAL_APPROVED === "true";
}
