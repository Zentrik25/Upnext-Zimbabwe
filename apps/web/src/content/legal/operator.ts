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
 * Publication gate. The text itself carries no "draft" wording; whether search engines may index it is
 * decided here. It stays closed until the owner records, in the environment of the deployed site, that the
 * checklist in docs/legal/LEGAL_APPROVAL_CHECKLIST.md is complete and a qualified Zimbabwean adviser has
 * reviewed the documents. Setting the flag is the owner's act; the application never sets it.
 */
export function legalPublished(env: Record<string, string | undefined> = process.env): boolean {
  return env.UPNEXT_LEGAL_APPROVED === "true";
}
