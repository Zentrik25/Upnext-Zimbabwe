import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout";
import { VerificationTag } from "@/components/opportunities/parts";
import { ShareButton } from "@/components/opportunities/share-button";
import { StickyApply } from "@/components/opportunities/sticky-apply";
import { ButtonLink, Tag } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { OpportunityDetail } from "@/lib/catalog-types";
import {
  SOURCE_KIND,
  VERIFICATION,
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

const PAY_CATEGORIES = ["jobs", "internships", "graduate-programmes"];

/** Outbound links are only ever rendered for https URLs (the API already enforces this; this is defence in depth). */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-6 scroll-mt-4">
      <h2 className="border-b border-line pb-1 text-title font-strong">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-muted" />
      <span>{children}</span>
    </li>
  );
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
  const width = compact ? "w-full" : "max-sm:w-full";
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
          className={width}
        >
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
          className={width}
        >
          Apply via Email
        </ButtonLink>
      ) : null}
      {instructionsOnly ? (
        <ButtonLink href="#how-to-apply" className={width}>
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
}: {
  listing: OpportunityDetail;
  preview?: boolean;
  personal?: ReactNode;
  related?: ReactNode;
}) {
  const open = isOpen(listing);
  const deadline = deadlineView(listing.deadline, listing.status);
  const pays = PAY_CATEGORIES.includes(listing.category.code);
  const pay = salaryLine(listing);
  const fundingLine = formatMoney(listing.funding);
  const vacancies = typeof listing.detail.vacancies === "number" ? listing.detail.vacancies : null;
  const more = Object.entries(listing.detail).filter(([key]) => key !== "vacancies");
  const where = listing.locations.map((l) => l.name).join(", ") || listing.location_text;
  const canApply = open && destinations(listing).any;
  const closedNote =
    listing.status === "withdrawn"
      ? "The issuer has withdrawn this opportunity. It is kept here so shared links keep working."
      : "This opportunity has closed. It is kept here so shared links keep working.";

  return (
    <Container className="pt-3 pb-[28px] max-sm:pb-[88px]">
      <div className="mx-auto w-full max-w-[820px]">
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

        <nav aria-label="Breadcrumb" className="text-small text-muted">
          <Link href="/opportunities" className="text-accent underline">
            Opportunities
          </Link>
          <span aria-hidden="true"> › </span>
          <Link href={`/opportunities?category=${listing.category.code}`} className="text-accent underline">
            {listing.category.name}
          </Link>
        </nav>

        <article aria-labelledby="listing-title" className="mt-2">
          <h1 id="listing-title" className="m-0 text-section font-strong leading-title tracking-section">
            {listing.title}
          </h1>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-title text-company">
            {listing.organisation.profile_slug && !preview ? (
              <Link href={`/employers/${listing.organisation.profile_slug}`} className="underline">
                {listing.organisation.name}
              </Link>
            ) : (
              <span>{listing.organisation.name}</span>
            )}
            <VerificationTag level={listing.verification.level} />
          </p>

          <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-ctl text-meta">
            {where ? <Fact icon="pin">{where}</Fact> : null}
            {labelFor(listing.employment_type) ? (
              <Fact icon="briefcase">{labelFor(listing.employment_type)}</Fact>
            ) : null}
            {labelFor(listing.work_mode) ? <Fact icon="building">{labelFor(listing.work_mode)}</Fact> : null}
            {pay ? <Fact icon="coin">{pay}</Fact> : null}
            {fundingLine ? <Fact icon="coin">Funding: {fundingLine}</Fact> : null}
            {vacancies !== null ? (
              <Fact icon="users">{vacancies === 1 ? "1 vacancy" : `${vacancies} vacancies`}</Fact>
            ) : null}
            <li className="inline-flex items-center gap-1.5">
              <Icon name="calendar" className="h-4 w-4 shrink-0 text-muted" />
              <Tag tone={deadline.tone}>{deadline.label}</Tag>
            </li>
          </ul>

          {canApply ? (
            <div className="mt-4 scroll-mt-4" id="apply" data-testid="apply">
              <div id="apply-primary">
                <ApplyActions listing={listing} />
              </div>
              <p className="m-0 mt-1.5 text-small text-muted">
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
            <div className="mt-2 flex flex-wrap items-center gap-x-2">
              {personal}
              <ShareButton title={listing.title} path={listing.canonical_path} />
            </div>
          ) : null}

          {listing.summary ? <p className="m-0 mt-5 text-base">{listing.summary}</p> : null}

          {listing.description_html ? (
            <Section title={pays ? "Key responsibilities" : "About this opportunity"}>
              <SafeHtml html={listing.description_html} />
            </Section>
          ) : null}
          {listing.requirements_html ? (
            <Section title={pays ? "Qualifications & experience" : "Requirements"}>
              <SafeHtml html={listing.requirements_html} />
            </Section>
          ) : null}

          {more.length > 0 || listing.skills.length > 0 || listing.experience_level ? (
            <Section title="More details">
              <dl className="mt-2 grid gap-2 text-base" data-testid="category-details">
                {listing.experience_level ? (
                  <div className="grid grid-cols-[200px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="text-muted">Experience level</dt>
                    <dd className="m-0">{labelFor(listing.experience_level)}</dd>
                  </div>
                ) : null}
                {more.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[200px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="text-muted">{humanise(key)}</dt>
                    <dd className="m-0">{format(value, key)}</dd>
                  </div>
                ))}
                {listing.skills.length > 0 ? (
                  <div className="grid grid-cols-[200px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="text-muted">Skills</dt>
                    <dd className="m-0 flex flex-wrap gap-1.5">
                      {listing.skills.map((s) => (
                        <Tag key={s.name}>{s.is_required ? `${s.name} (required)` : s.name}</Tag>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Section>
          ) : null}

          {open ? (
            <Section id="how-to-apply" title="How to apply">
              <div className="mt-2 grid gap-2 text-base">
                {listing.application.instructions ? (
                  <p className="m-0 whitespace-pre-line">{listing.application.instructions}</p>
                ) : null}
                {listing.application.email &&
                (listing.application.method === "email" || listing.application.method === "both") ? (
                  <p className="m-0">
                    Send your application to{" "}
                    <a
                      href={mailtoHref(listing.application.email, listing.application.email_subject)}
                      className="text-accent underline"
                    >
                      {listing.application.email}
                    </a>
                    {listing.application.email_subject ? (
                      <> with the subject “{listing.application.email_subject}”</>
                    ) : null}
                    .
                  </p>
                ) : null}
                {listing.application.url &&
                isHttps(listing.application.url) &&
                (listing.application.method === "external_url" || listing.application.method === "both") ? (
                  <p className="m-0">Apply on {domainOf(listing.application.url)}.</p>
                ) : null}
                {listing.reference_number ? (
                  <p className="m-0">Reference: {listing.reference_number}</p>
                ) : null}
                {listing.contact_details ? (
                  <p className="m-0 text-muted">Contact: {listing.contact_details}</p>
                ) : null}
                <p className="m-0 text-small text-muted">
                  Never pay to apply. Read{" "}
                  <Link href="/guides/apply-safely-and-avoid-scams" className="text-accent underline">
                    how to apply safely and avoid scams
                  </Link>
                  .
                </p>
              </div>
            </Section>
          ) : null}

          <Section title="Where this came from">
            <p className="m-0 mt-2 text-small text-muted">
              <strong>{VERIFICATION[listing.verification.level].label}.</strong>{" "}
              {VERIFICATION[listing.verification.level].explanation}
              {listing.verification.checked_at
                ? ` Last checked ${formatDate(listing.verification.checked_at, "Africa/Harare")}.`
                : ""}
            </p>
            <ul className="m-0 mt-2 grid list-none gap-2 p-0 text-base" aria-label="Sources">
              {listing.sources.map((s) => (
                <li key={`${s.name}-${s.observed_on}`}>
                  <span className="font-strong">
                    {s.name}
                    {s.is_primary ? " (primary)" : ""}
                  </span>{" "}
                  <span className="text-small text-muted">
                    · {SOURCE_KIND[s.kind] ?? humanise(s.kind)} · checked {formatDate(s.observed_on)}
                  </span>
                  {s.url && isHttps(s.url) ? (
                    <>
                      {" "}
                      <a
                        href={s.url}
                        rel="noopener noreferrer nofollow ugc"
                        target="_blank"
                        className="text-small text-accent underline"
                      >
                        {domainOf(s.url)}
                        <span className="sr-only"> (opens the source in a new tab)</span>
                      </a>
                    </>
                  ) : null}
                  {s.citation ? <span className="block text-small">{s.citation}</span> : null}
                </li>
              ))}
            </ul>
            {!preview ? (
              <p className="m-0 mt-3 text-small text-muted">
                Something wrong?{" "}
                <Link
                  href={`/opportunities/${listing.slug}/report`}
                  className="text-accent underline"
                  data-testid="report-link"
                >
                  Report this opportunity
                </Link>
                .
              </p>
            ) : null}
          </Section>
        </article>
        {related}
      </div>
      {canApply && !preview ? (
        <StickyApply targetId="apply-primary">
          <ApplyActions listing={listing} compact />
        </StickyApply>
      ) : null}
    </Container>
  );
}
