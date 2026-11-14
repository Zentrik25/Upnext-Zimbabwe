import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout";
import { VerificationTag } from "@/components/opportunities/parts";
import { FeaturedImage } from "@/components/opportunities/featured-image";
import { ListingRecord } from "@/components/opportunities/listing-record";
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

/**
 * The listing's destination buttons, split for the one-line action row: the first real destination is the primary
 * button (Apply Now, else Apply via Email, else the instructions) and shares the row with Save and Share; a second
 * destination (e-mail beside a website) goes on its own line beneath. Nothing is drawn for a destination that does
 * not exist.
 */
function applyButtons(listing: OpportunityDetail): { primary: ReactNode; others: ReactNode[] } {
  const { application } = listing;
  const { web, mail, instructions: instructionsOnly } = destinations(listing);
  const big = "min-h-field min-w-0 gap-2 text-ctl";
  const buttons: ReactNode[] = [];
  if (web)
    buttons.push(
      <ButtonLink
        key="web"
        href={application.url as string}
        data-listing-apply
        rel="noopener noreferrer nofollow ugc"
        target="_blank"
        className={`${big} flex-1`}
      >
        <Icon name="external" className="h-4 w-4 shrink-0" />
        Apply Now
        <span className="sr-only">
          {" "}
          (opens the issuer&apos;s website, {domainOf(application.url as string)}, in a new tab)
        </span>
      </ButtonLink>,
    );
  if (mail)
    buttons.push(
      <ButtonLink
        key="mail"
        href={mailtoHref(application.email as string, application.email_subject)}
        data-listing-apply
        variant={web ? "secondary" : "primary"}
        className={`${big} flex-1`}
      >
        <Icon name="mail" className="h-4 w-4 shrink-0" />
        Apply via Email
      </ButtonLink>,
    );
  if (instructionsOnly)
    buttons.push(
      <ButtonLink key="instructions" href="#how-to-apply" className={`${big} flex-1`}>
        <Icon name="external" className="h-4 w-4 shrink-0" />
        View Application Instructions
      </ButtonLink>,
    );
  return { primary: buttons[0] ?? null, others: buttons.slice(1) };
}

/** Whether a value was really entered: nothing, a blank string, an empty list or an object of blanks is not. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isBlank);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isBlank);
  return false;
}

function format(value: unknown, key: string): ReactNode {
  if (isBlank(value)) return null; // callers never ask for a blank: nothing is printed for it
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
        {value
          .filter((item) => !isBlank(item))
          .map((item, i) => (
            <li key={i}>{typeof item === "string" ? humaniseValue(item) : JSON.stringify(item)}</li>
          ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="m-0 grid gap-1">
        {Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => !isBlank(v))
          .map(([k, v]) => (
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
  const vacancies =
    typeof listing.detail.vacancies === "number" && listing.detail.vacancies >= 1
      ? listing.detail.vacancies
      : null;
  // Only what was really entered is listed: a blank value is not "Not stated", it is absent.
  const more = Object.entries(listing.detail).filter(
    ([key, value]) => key !== "vacancies" && !RETIRED_DETAIL.includes(key) && !isBlank(value),
  );
  const hasDeadline = listing.deadline.at !== null;
  const facts = Boolean(pay) || Boolean(fundingLine) || vacancies !== null || hasDeadline;
  const { primary, others } = applyButtons(listing);
  const where = listing.locations.map((l) => l.name).join(", ") || listing.location_text;
  const canApply = open && destinations(listing).any;
  const closedNote =
    listing.status === "withdrawn"
      ? "The issuer has withdrawn this opportunity. It is kept here so shared links keep working."
      : "This opportunity has closed. It is kept here so shared links keep working.";

  const verified = listing.verification.level === "issuer_verified";
  const instructionsPlain = (listing.application.instructions ?? "").trim();
  const instructionsText = instructionsPlain.toLowerCase();
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
  const reference = (listing.reference_number ?? "").trim();
  const contact = (listing.contact_details ?? "").trim();
  const showReference = reference !== "" && !instructionsText.includes(reference.toLowerCase());
  const showContact = contact !== "" && !instructionsText.includes(contact.toLowerCase());
  const deadlineTone = deadline.tone === "good" ? "good" : deadline.tone === "urgent" ? "urgent" : "muted";

  return (
    <Container className="pt-3 pb-6">
      <div
        data-job-page
        className="mx-auto w-full max-w-[820px] md:grid md:max-w-[1160px] md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-8"
      >
        <div data-testid="job-main" className="min-w-0">
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

          {/* Long unbroken text (a pasted application address) wraps instead of widening the page on a phone. */}
          <article aria-labelledby="listing-title" className="mt-2 [overflow-wrap:anywhere]">
            <h1
              id="listing-title"
              className="m-0 text-title font-strong leading-title text-ink [overflow-wrap:anywhere]"
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
              <FeaturedImage src={listing.image.featured} alt={listing.image.alt} />
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
            {facts ? (
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                {pay ? <Chip icon="layers">{pay}</Chip> : null}
                {fundingLine ? <Chip icon="coin">Funding: {fundingLine}</Chip> : null}
                {vacancies !== null ? (
                  <Chip icon="users">{vacancies === 1 ? "1 vacancy" : `${vacancies} vacancies`}</Chip>
                ) : null}
                {hasDeadline ? (
                  <Chip icon="calendar" tone={deadlineTone}>
                    {deadline.label}
                  </Chip>
                ) : null}
              </ul>
            ) : null}

            {(canApply && primary) || !preview ? (
              <div
                className="mt-4 scroll-mt-16"
                id={canApply ? "apply" : undefined}
                data-testid={canApply ? "apply" : undefined}
              >
                {/* One line on every screen: Apply Now takes what is left, Save and Share are equal squares. */}
                <div
                  id="apply-primary"
                  data-testid="action-row"
                  className="relative flex items-stretch gap-2"
                >
                  {canApply ? primary : null}
                  {!preview ? personal : null}
                  {!preview ? <ShareButton title={listing.title} path={listing.canonical_path} icon /> : null}
                </div>
                {canApply && others.length > 0 ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 [&>*:only-child]:sm:col-span-2">
                    {others}
                  </div>
                ) : null}
                {canApply ? (
                  <p className="sr-only">
                    {listing.application.method === "instructions"
                      ? "Follow the issuer's instructions."
                      : listing.application.method === "email"
                        ? "You will apply by e-mail with the issuer."
                        : "You will leave UPNEXT to apply with the issuer."}{" "}
                    UPNEXT does not receive or track applications.
                  </p>
                ) : null}
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

            {open ? (
              <Block id="how-to-apply" icon="doc" title="How to apply">
                <div className="m-0 grid gap-1.5 text-base">
                  {instructionsPlain ? (
                    listing.application.instructions_html ? (
                      <div data-testid="instructions" className="[&>*:first-child]:mt-0">
                        <SafeHtml html={listing.application.instructions_html} />
                      </div>
                    ) : (
                      <p className="m-0 whitespace-pre-line">{instructionsPlain}</p>
                    )
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
                <p className="m-0 mt-3 flex items-start gap-2 rounded-card bg-match-bg px-3 py-2 text-small text-ink">
                  <Icon name="info" className="mt-px h-4 w-4 shrink-0 text-accent" />
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

            {more.length > 0 || listing.skills.length > 0 ? (
              <Block icon="layers" title="More details">
                <dl className="m-0 grid gap-1.5 text-base" data-testid="category-details">
                  {more.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[170px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0"
                    >
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

            <ListingRecord listing={listing} />

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
        </div>
        {/* Beside the listing from the desktop width up (the space at the right), below it on a phone and tablet. */}
        {related ? (
          <div data-testid="job-aside" className="md:sticky md:top-20">
            {related}
          </div>
        ) : null}
      </div>
    </Container>
  );
}
