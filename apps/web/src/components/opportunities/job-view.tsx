import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout";
import { VerificationTag } from "@/components/opportunities/parts";
import { ShareButton } from "@/components/opportunities/share-button";
import { Block, Chip, OrgMark, withoutRepeatedHeadings } from "@/components/opportunities/job-parts";
import { ButtonLink, Tag } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import type { OpportunityDetail } from "@/lib/catalog-types";
import {
  deadlineView,
  domainOf,
  formatDate,
  formatMoney,
  humanise,
  labelFor,
  mailtoHref,
  salaryLine,
} from "@/lib/format";
import { SafeHtml } from "@/lib/safe-html";
import { isOpen } from "@/lib/structured-data";
import { RETIRED_DETAIL } from "@/lib/job-editor";

const PAY_CATEGORIES = ["jobs", "internships", "graduate-programmes"];

/** Outbound links are only ever rendered for https URLs (the API already enforces this; this is defence in depth). */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Which destinations the listing really has. A source link or an empty field is never one. */
function destinations(listing: OpportunityDetail) {
  const { application } = listing;
  const web =
    (application.method === "external_url" || application.method === "both") &&
    Boolean(application.url) &&
    isHttps(application.url as string);
  const mail =
    (application.method === "email" || application.method === "both") && Boolean(application.email);
  const instructions = application.method === "instructions" && Boolean(application.instructions);
  return { web, mail, instructions, any: web || mail || instructions };
}

/** The listing's destination buttons. Nothing is drawn for a destination that does not exist. */
function ApplyActions({ listing, compact = false }: { listing: OpportunityDetail; compact?: boolean }) {
  const { application } = listing;
  const { web, mail, instructions: instructionsOnly, any } = destinations(listing);
  if (!any) return null;
  const width = compact ? "w-full" : "w-full sm:w-auto";
  const big = "min-h-[48px] gap-2 text-base";
  return (
    <div
      className={
        compact ? "grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2" : "flex flex-wrap gap-2 max-sm:grid"
      }
    >
      {web ? (
        <ButtonLink
          href={application.url as string}
          data-listing-apply
          rel="noopener noreferrer nofollow ugc"
          target="_blank"
          className={`${width} ${big}`}
        >
          <Icon name="external" className="h-5 w-5" />
          Apply Now
          <span className="sr-only">
            {" "}
            (opens the issuer&apos;s website, {domainOf(application.url as string)}, in a new tab)
          </span>
        </ButtonLink>
      ) : null}
      {mail ? (
        <ButtonLink
          href={mailtoHref(application.email as string, application.email_subject)}
          data-listing-apply
          variant={web ? "secondary" : "primary"}
          className={`${width} ${big}`}
        >
          <Icon name="mail" className="h-5 w-5" />
          Apply via Email
        </ButtonLink>
      ) : null}
      {instructionsOnly ? (
        <ButtonLink href="#how-to-apply" className={`${width} ${big}`}>
          <Icon name="external" className="h-5 w-5" />
          View Application Instructions
        </ButtonLink>
      ) : null}
    </div>
  );
}

function format(value: unknown, key: string): ReactNode {
  if (value === null || value === undefined) return "Not stated";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return key.endsWith("_at") && !Number.isNaN(Date.parse(value))
      ? formatDate(value, "Africa/Harare", true)
      : humaniseValue(value);
  }
  if (Array.isArray(value)) {
    return (
      <ul className="m-0 list-disc pl-5">
        {value.map((item, i) => (
          <li key={i}>{typeof item === "string" ? humaniseValue(item) : JSON.stringify(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="m-0 grid gap-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <dt className="inline text-muted">{humanise(k)}: </dt>
            <dd className="m-0 inline">{format(v, k)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return String(value);
}

const LANGUAGES: Record<string, string> = { en: "English", sn: "Shona", nd: "Ndebele" };

/** Enum-like values (`bachelors_degree`) read as words; free text is left untouched. */
function humaniseValue(text: string): string {
  if (LANGUAGES[text]) return LANGUAGES[text];
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(text)) return humanise(text);
  return /^[a-z]+$/.test(text) ? humanise(text) : text;
}

/**
 * One listing, top to bottom, in the order a job seeker decides in: title, who and how genuine, the facts, the way
 * to apply, then the substance. Each fact appears once. Nothing is drawn for a value the listing does not have.
 * `personal` (save) and `related` arrive as slots because they need the visitor's session or a second request.
 */
export function JobView({
  listing,
  preview = false,
  personal,
  related,
  ad,
}: {
  listing: OpportunityDetail;
  preview?: boolean;
  personal?: ReactNode;
  related?: ReactNode;
  /** A labelled advertising slot, placed between content blocks (never beside the apply, save or share controls). */
  ad?: ReactNode;
}) {
  const open = isOpen(listing);
  const deadline = deadlineView(listing.deadline, listing.status);
  const pays = PAY_CATEGORIES.includes(listing.category.code);
  const pay = salaryLine(listing);
  const fundingLine = formatMoney(listing.funding);
  const vacancies = typeof listing.detail.vacancies === "number" ? listing.detail.vacancies : null;
  const more = Object.entries(listing.detail).filter(
    ([key]) => key !== "vacancies" && !RETIRED_DETAIL.includes(key),
  );
  const where = listing.locations.map((l) => l.name).join(", ") || listing.location_text;
  const canApply = open && destinations(listing).any;
  const closedNote =
    listing.status === "withdrawn"
      ? "The issuer has withdrawn this opportunity. It is kept here so shared links keep working."
      : "This opportunity has closed. It is kept here so shared links keep working.";

  const verified = listing.verification.level === "issuer_verified";
  const instructionsText = (listing.application.instructions ?? "").toLowerCase();
  const email = listing.application.email;
  const showEmail =
    Boolean(email) &&
    (listing.application.method === "email" || listing.application.method === "both") &&
    !instructionsText.includes((email as string).toLowerCase());
  const applyUrl = listing.application.url;
  const showUrl =
    Boolean(applyUrl) &&
    isHttps(applyUrl as string) &&
    (listing.application.method === "external_url" || listing.application.method === "both") &&
    !instructionsText.includes(domainOf(applyUrl as string).toLowerCase());
  const showReference =
    Boolean(listing.reference_number) &&
    !instructionsText.includes((listing.reference_number as string).toLowerCase());
  const showContact =
    Boolean(listing.contact_details) &&
    !instructionsText.includes((listing.contact_details as string).toLowerCase());
  const deadlineTone = deadline.tone === "good" ? "good" : deadline.tone === "urgent" ? "urgent" : "muted";

  return (
    <Container className="pt-3 pb-6">
      <div data-job-page className="mx-auto w-full max-w-[820px]">
        {!open ? (
          <div
            role="status"
            data-testid="status-banner"
            className="mb-3 rounded-card border border-border-notice bg-surface-notice px-3 py-[10px] text-base"
          >
            <strong className="block text-title">
              {listing.status === "withdrawn" ? "Withdrawn by the issuer" : "Closed"}
            </strong>
            {closedNote}
          </div>
        ) : null}

        <nav aria-label="Breadcrumb" className="text-ctl text-muted">
          <Link href="/opportunities" className="text-accent">
            Opportunities
          </Link>
          <span aria-hidden="true"> › </span>
          <Link href={`/opportunities?category=${listing.category.code}`} className="text-accent">
            {listing.category.name}
          </Link>
        </nav>

        <article aria-labelledby="listing-title" className="mt-2">
          <h1
            id="listing-title"
            className="font-headline m-0 text-[30px] leading-[1.12] tracking-sub text-ink [overflow-wrap:anywhere] sm:text-sub"
          >
            {listing.title}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <OrgMark name={listing.organisation.name} />
            <p
              data-bold
              className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-title text-ink"
            >
              {listing.organisation.profile_slug && !preview ? (
                <Link href={`/employers/${listing.organisation.profile_slug}`}>
                  {listing.organisation.name}
                </Link>
              ) : (
                <span>{listing.organisation.name}</span>
              )}
              {verified ? (
                <span className="inline-flex text-accent" data-testid="verified-badge">
                  <Icon name="badgeCheck" className="h-6 w-6" />
                  <span className="sr-only">Verified</span>
                </span>
              ) : (
                <VerificationTag level={listing.verification.level} />
              )}
            </p>
          </div>

          {listing.image?.featured ? (
            <figure className="m-0 mt-3" data-testid="featured-image">
              {/* eslint-disable-next-line @next/next/no-img-element -- the listing's own picture from our media path */}
              <img
                src={listing.image.featured}
                alt={listing.image.alt || ""}
                width={1280}
                height={720}
                fetchPriority="high"
                className="block h-auto w-full rounded-card border border-line bg-surface-pale object-cover"
                style={{ aspectRatio: "16 / 9" }}
              />
            </figure>
          ) : null}

          {where || labelFor(listing.employment_type) || labelFor(listing.work_mode) ? (
            <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
              {where ? <Chip icon="pin">{where}</Chip> : null}
              {labelFor(listing.employment_type) ? (
                <Chip icon="briefcase">{labelFor(listing.employment_type)}</Chip>
              ) : null}
              {labelFor(listing.work_mode) ? (
                <Chip icon="building">{labelFor(listing.work_mode)}</Chip>
              ) : null}
            </ul>
          ) : null}
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {pays ? (
              <Chip icon="layers">{pay ?? "Pay: TBA"}</Chip>
            ) : pay ? (
              <Chip icon="layers">{pay}</Chip>
            ) : null}
            {fundingLine ? <Chip icon="coin">Funding: {fundingLine}</Chip> : null}
            {vacancies !== null ? (
              <Chip icon="users">{vacancies === 1 ? "1 vacancy" : `${vacancies} vacancies`}</Chip>
            ) : null}
            <Chip icon="calendar" tone={deadlineTone}>
              {deadline.label}
            </Chip>
          </ul>

          {canApply ? (
            <div className="mt-4 scroll-mt-16" id="apply" data-testid="apply">
              <div id="apply-primary">
                <ApplyActions listing={listing} />
              </div>
              <p className="sr-only">
                {listing.application.method === "instructions"
                  ? "Follow the issuer's instructions."
                  : listing.application.method === "email"
                    ? "You will apply by e-mail with the issuer."
                    : "You will leave UPNEXT to apply with the issuer."}{" "}
                UPNEXT does not receive or track applications.
              </p>
            </div>
          ) : null}
          {!preview ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-[420px] [&>*:only-child]:col-span-2">
              {personal}
              <ShareButton title={listing.title} path={listing.canonical_path} block />
            </div>
          ) : null}

          {listing.summary ? (
            <section className="mt-5" aria-labelledby="overview-title">
              <h2 id="overview-title" className="m-0 mb-1.5 text-title font-strong leading-title text-ink">
                Overview
              </h2>
              <p className="m-0 text-base">{listing.summary}</p>
            </section>
          ) : null}

          {listing.description_html ? (
            <Block icon="clipboard" title={pays ? "Key responsibilities" : "About this opportunity"}>
              <SafeHtml html={withoutRepeatedHeadings(listing.description_html)} />
            </Block>
          ) : null}
          {!preview ? ad : null}
          {listing.requirements_html ? (
            <Block icon="cap" title={pays ? "Qualifications & experience" : "Requirements"}>
              <SafeHtml html={withoutRepeatedHeadings(listing.requirements_html)} />
            </Block>
          ) : null}

          {more.length > 0 || listing.skills.length > 0 ? (
            <Block icon="layers" title="More details">
              <dl className="m-0 grid gap-1.5 text-base" data-testid="category-details">
                {more.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[170px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="text-muted">{humanise(key)}</dt>
                    <dd className="m-0">{format(value, key)}</dd>
                  </div>
                ))}
                {listing.skills.length > 0 ? (
                  <div className="grid grid-cols-[170px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="text-muted">Skills</dt>
                    <dd className="m-0 flex flex-wrap gap-1.5">
                      {listing.skills.map((s) => (
                        <Tag key={s.name}>{s.is_required ? `${s.name} (required)` : s.name}</Tag>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Block>
          ) : null}

          {open ? (
            <Block id="how-to-apply" icon="doc" title="How to apply">
              <div className="m-0 grid gap-1.5 text-base">
                {listing.application.instructions ? (
                  <p className="m-0 whitespace-pre-line">{listing.application.instructions}</p>
                ) : null}
                {showEmail ? (
                  <p className="m-0">
                    Send your application to{" "}
                    <a
                      href={mailtoHref(email as string, listing.application.email_subject)}
                      className="text-accent underline"
                    >
                      {email}
                    </a>
                    {listing.application.email_subject ? (
                      <> with the subject “{listing.application.email_subject}”</>
                    ) : null}
                    .
                  </p>
                ) : null}
                {showUrl ? <p className="m-0">Apply on {domainOf(applyUrl as string)}.</p> : null}
                {showReference ? <p className="m-0">Reference: {listing.reference_number}</p> : null}
                {showContact ? <p className="m-0 text-muted">Contact: {listing.contact_details}</p> : null}
              </div>
              <p className="m-0 mt-3 flex items-start gap-2 rounded-card bg-match-bg p-3 text-ctl text-ink">
                <Icon name="info" className="mt-px h-5 w-5 shrink-0 text-accent" />
                <span>
                  Never pay to apply. Read{" "}
                  <Link href="/guides/apply-safely-and-avoid-scams" className="text-accent underline">
                    how to apply safely
                  </Link>
                  .
                </span>
              </p>
            </Block>
          ) : null}

          {!preview ? (
            <p className="m-0 mt-4 flex items-center gap-2 border-t border-line pt-3 text-small text-muted">
              <Icon name="flag" className="h-4 w-4 shrink-0" />
              <span>
                Something wrong?{" "}
                <Link
                  href={`/opportunities/${listing.slug}/report`}
                  className="text-accent"
                  data-testid="report-link"
                >
                  Report this opportunity
                </Link>
              </span>
            </p>
          ) : null}
        </article>
        {related}
      </div>
    </Container>
  );
}
