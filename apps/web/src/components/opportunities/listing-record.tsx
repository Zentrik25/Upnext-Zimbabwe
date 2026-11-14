import Link from "next/link";
import type { OpportunityDetail, Source } from "@/lib/catalog-types";
import { formatDate, REVERIFICATION_PENDING, VERIFICATION, VERIFICATION_METHOD } from "@/lib/format";
import { Block } from "@/components/opportunities/job-parts";

/**
 * "About this listing" (AdSense audit 2026-11-14, D-74 DRAFT): what UPNEXT itself knows about a listing, drawn only
 * from recorded facts. It shows when the listing was published and last changed, the original source where one is
 * recorded (D-74 supersedes D-67 for the job page only; nothing is shown when none is recorded), what the
 * verification label means and when the check was made, and a neutral note when applications go to a free webmail
 * address. Nothing here is invented: a missing fact is simply not drawn.
 */

/** Free webmail providers: an address on one of these is not on the organisation's own domain. */
export const WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

export function webmailDomain(email: string | null | undefined): string | null {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1];
  return domain && WEBMAIL_DOMAINS.has(domain) ? domain : null;
}

/** The primary source, else the first one; null when none is recorded. */
export function primarySource(sources: Source[] | undefined): Source | null {
  if (!sources?.length) return null;
  return sources.find((s) => s.is_primary) ?? sources[0]!;
}

function httpsUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const day = (iso: string) => formatDate(iso, "Africa/Harare");

export function ListingRecord({ listing }: { listing: OpportunityDetail }) {
  const published = listing.published_at ? day(listing.published_at) : null;
  const updated = listing.updated_at ? day(listing.updated_at) : null;
  const source = primarySource(listing.sources);
  const sourceUrl = httpsUrl(source?.url ?? null);
  const level = listing.verification.level;
  const label = VERIFICATION[level] ?? VERIFICATION.not_verified;
  const checked = listing.verification.checked_at ? day(listing.verification.checked_at) : null;
  const pending = Boolean(listing.verification.reverification_pending);
  const method = listing.verification.method
    ? (VERIFICATION_METHOD[listing.verification.method] ?? null)
    : null;
  const webmail = webmailDomain(listing.application.email);

  return (
    <Block icon="info" title="About this listing">
      <dl className="m-0 grid gap-2 text-base" data-testid="listing-record">
        {published ? (
          <div className="grid grid-cols-[170px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
            <dt className="text-muted">Published on UPNEXT</dt>
            <dd className="m-0">
              {published}
              {updated && updated !== published ? <> · last updated {updated}</> : null}
            </dd>
          </div>
        ) : null}
        {source ? (
          <div className="grid grid-cols-[170px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
            <dt className="text-muted">Original source</dt>
            <dd className="m-0" data-testid="listing-source">
              {sourceUrl ? (
                <a href={sourceUrl} rel="noopener nofollow" className="text-accent underline">
                  {source.name}
                </a>
              ) : (
                source.name
              )}
              {source.observed_on ? <>, seen on {day(source.observed_on)}</> : null}
            </dd>
          </div>
        ) : null}
        <div className="grid grid-cols-[170px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
          <dt className="text-muted">Verification</dt>
          <dd className="m-0" data-testid="listing-verification">
            <strong>{label.label}.</strong>{" "}
            {level === "issuer_verified" && pending ? (
              <>{REVERIFICATION_PENDING} </>
            ) : level === "issuer_verified" && method ? (
              <>
                {method}
                {checked ? <> Checked on {checked}.</> : null}{" "}
              </>
            ) : (
              <>
                {label.explanation}
                {level === "issuer_verified" && checked ? <> Checked on {checked}.</> : null}
                {level === "not_verified" ? (
                  <> Check it with the organisation before you apply.</>
                ) : null}{" "}
              </>
            )}
            <Link href="/guides/how-listings-are-verified" className="text-accent underline">
              What the labels mean
            </Link>
          </dd>
        </div>
      </dl>
      {webmail ? (
        <p
          className="m-0 mt-3 rounded-card border border-line bg-surface-pale px-3 py-2 text-small text-ink"
          data-testid="webmail-note"
        >
          Applications for this listing go to a {webmail} address, not to an address on the
          organisation&apos;s own website. Some genuine employers use free e-mail, but so do fake recruiters:
          confirm the vacancy with the organisation through a contact you find yourself before you send
          documents, and never pay to apply.
        </p>
      ) : null}
    </Block>
  );
}
