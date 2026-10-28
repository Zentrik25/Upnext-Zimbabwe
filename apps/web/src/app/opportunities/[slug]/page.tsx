import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Container } from "@/components/layout";
import { SaveToggle } from "@/components/account/save-toggle";
import { JsonLd } from "@/components/seo/json-ld";
import { ListingEvents } from "@/components/opportunities/listing-events";
import { VerificationTag } from "@/components/opportunities/parts";
import { Callout, EmptyState, Panel, Tag } from "@/components/ui";
import { getOpportunity } from "@/lib/catalog";
import type { OpportunityDetail } from "@/lib/catalog-types";
import {
  VERIFICATION,
  SOURCE_KIND,
  deadlineView,
  domainOf,
  formatDate,
  formatMoney,
  humanise,
  labelFor,
} from "@/lib/format";
import { SafeHtml } from "@/lib/safe-html";
import { absolute } from "@/lib/site";
import { breadcrumbFor, jobPostingFor } from "@/lib/structured-data";
import { getCurrentUser, getSavedIds } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok || result.data === null) return { title: "Opportunity not found", robots: { index: false } };
  const listing = result.data;
  return {
    title: `${listing.title} · ${listing.organisation.name}`,
    description: listing.summary,
    alternates: { canonical: listing.canonical_path },
    openGraph: openGraphFor(listing.canonical_path, { title: listing.title, description: listing.summary }),
    // Expired and withdrawn listings stay readable but are not promoted by search engines (OQ-20 default).
    robots: listing.status === "published" ? undefined : { index: false },
  };
}

export default async function OpportunityPage({ params }: Props) {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok) {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="This opportunity is unavailable">
          {result.reason === "rate-limited"
            ? "Too many requests. Wait a minute and try again."
            : "The service could not be reached. Try again shortly."}
        </EmptyState>
      </Container>
    );
  }
  if (result.data === null) notFound();
  const listing = result.data;
  const deadline = deadlineView(listing.deadline, listing.status);
  const salary = formatMoney(listing.salary);
  const funding = formatMoney(listing.funding);
  const user = await getCurrentUser();
  const isSaved = user ? (await getSavedIds([listing.id])).has(listing.id) : false;

  const pageUrl = absolute(`/opportunities/${listing.slug}`);
  const posting = jobPostingFor(listing, pageUrl);
  return (
    <>
      {posting ? <JsonLd data={posting} /> : null}
      {listing.status === "published" ? (
        <JsonLd
          data={breadcrumbFor([
            { name: "Opportunities", url: absolute("/opportunities") },
            { name: listing.title, url: pageUrl },
          ])}
        />
      ) : null}
      <ListingEvents slug={listing.slug} open={listing.status === "published"} />
      <Container className="pt-[18px] pb-[65px]">
        {listing.status !== "published" ? (
          <div
            role="status"
            data-testid="status-banner"
            className="mb-4 rounded-card border border-border-notice bg-surface-notice px-3 py-[10px] text-base"
          >
            <strong className="block text-title">
              {listing.status === "expired" ? "Closed" : "Withdrawn by the issuer"}
            </strong>
            {listing.status === "expired"
              ? "This opportunity has closed. It is kept here so shared links keep working."
              : "The issuer has withdrawn this opportunity. It is kept here so shared links keep working."}
          </div>
        ) : null}
        <p className="text-ctl">
          <Link href="/opportunities" className="text-accent underline">
            ← All opportunities
          </Link>
        </p>
        <article
          aria-labelledby="listing-title"
          className="mt-3 grid grid-cols-[1fr_300px] gap-8 max-md:grid-cols-1"
        >
          <div className="min-w-0">
            <p className="text-micro font-semi uppercase tracking-eyebrow text-eyebrow">
              {listing.category.name}
            </p>
            <h1 id="listing-title" className="mt-1 text-section font-strong leading-title tracking-section">
              {listing.title}
            </h1>
            <p className="mt-1 text-title text-company">
              {listing.organisation.profile_slug ? (
                <Link href={`/employers/${listing.organisation.profile_slug}`} className="underline">
                  {listing.organisation.name}
                </Link>
              ) : (
                listing.organisation.name
              )}
            </p>
            {listing.status === "published" || isSaved ? (
              <SaveToggle
                className="mt-2"
                opportunityId={listing.id}
                title={listing.title}
                initialSaved={isSaved}
                signedIn={Boolean(user)}
                returnTo={`/opportunities/${listing.slug}`}
                showLabel
              />
            ) : null}
            <ul className="m-0 my-3 flex list-none flex-wrap gap-[10px] p-0 text-small text-meta">
              {listing.locations.map((l) => (
                <li key={l.slug}>{l.name}</li>
              ))}
              {[
                labelFor(listing.employment_type),
                labelFor(listing.work_mode),
                labelFor(listing.experience_level),
              ]
                .filter((x): x is string => Boolean(x))
                .map((x) => (
                  <li key={x}>{x}</li>
                ))}
              <li>
                <Tag tone={deadline.tone}>{deadline.label}</Tag>
              </li>
              <li>
                <VerificationTag level={listing.verification.level} />
              </li>
            </ul>
            <p className="mt-2 text-base">{listing.summary}</p>
            {listing.status === "published" ? (
              <p className="mt-3 text-base md:hidden">
                <a href="#apply" className="text-accent underline">
                  How to apply
                </a>
              </p>
            ) : null}

            <Section title="About this opportunity">
              <SafeHtml html={listing.description_html} />
            </Section>
            {listing.requirements_html ? (
              <Section title="Requirements">
                <SafeHtml html={listing.requirements_html} />
              </Section>
            ) : null}
            {Object.keys(listing.detail).length > 0 ? (
              <Section title="Details">
                <DetailList detail={listing.detail} />
              </Section>
            ) : null}
            {listing.skills.length > 0 ? (
              <Section title="Skills">
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {listing.skills.map((s) => (
                    <li key={s.name}>
                      <Tag>{s.is_required ? `${s.name} (required)` : s.name}</Tag>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>

          <aside aria-label="Key facts and how to apply" className="grid h-max gap-4">
            <Apply listing={listing} />
            <Panel>
              <h2 className="text-title font-strong">Key facts</h2>
              <dl className="mt-2 grid gap-2 text-base">
                <Fact term="Deadline" value={deadline.label} />
                <Fact
                  term="Pay"
                  value={salary ?? "Not stated"}
                  hidden={
                    listing.salary === null &&
                    listing.category.code !== "jobs" &&
                    listing.category.code !== "internships" &&
                    listing.category.code !== "graduate-programmes"
                  }
                />
                <Fact term="Funding" value={funding ?? "Not stated"} hidden={listing.funding === null} />
                <Fact
                  term="Eligible location"
                  value={listing.geographic_eligibility}
                  hidden={!listing.geographic_eligibility}
                />
                <Fact term="Where" value={listing.location_text} hidden={!listing.location_text} />
                <Fact term="Reference" value={listing.reference_number} hidden={!listing.reference_number} />
                <Fact term="Published" value={formatDate(listing.published_at, "Africa/Harare")} />
              </dl>
            </Panel>
            <Panel>
              <h2 className="text-title font-strong">Where this came from</h2>
              <p className="mt-2 text-small text-muted">
                <strong>{VERIFICATION[listing.verification.level].label}.</strong>{" "}
                {VERIFICATION[listing.verification.level].explanation}
                {listing.verification.checked_at
                  ? ` Last checked ${formatDate(listing.verification.checked_at, "Africa/Harare")}.`
                  : ""}
              </p>
              <ul className="m-0 mt-3 grid list-none gap-3 p-0 text-base" aria-label="Sources">
                {listing.sources.map((s) => (
                  <li key={`${s.name}-${s.observed_on}`}>
                    <p className="font-strong">
                      {s.name}
                      {s.is_primary ? " (primary)" : ""}
                    </p>
                    <p className="text-small text-muted">
                      {SOURCE_KIND[s.kind] ?? humanise(s.kind)} · checked {formatDate(s.observed_on)}
                    </p>
                    {s.url && isHttps(s.url) ? (
                      <a
                        href={s.url}
                        rel="noopener noreferrer nofollow ugc"
                        target="_blank"
                        className="text-small text-accent underline"
                      >
                        {domainOf(s.url)} (opens the source in a new tab)
                      </a>
                    ) : null}
                    {s.citation ? <p className="text-small">{s.citation}</p> : null}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel>
              <h2 className="text-title font-strong">Something wrong?</h2>
              <p className="mt-2 text-small text-muted">
                Tell us about a suspected fake, a request for payment, wrong application details or an expired
                listing.
              </p>
              <p className="mt-2 text-base">
                <Link
                  href={`/opportunities/${listing.slug}/report`}
                  className="text-accent underline"
                  data-testid="report-link"
                >
                  Report this opportunity
                </Link>
              </p>
            </Panel>
          </aside>
        </article>
      </Container>
    </>
  );
}

/** Outbound links are only ever rendered for https URLs (the API already enforces this; this is defence in depth). */
function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="border-b border-line pb-1 text-title font-strong">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ term, value, hidden }: { term: string; value: string | null; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div>
      <dt className="text-small text-muted">{term}</dt>
      <dd className="m-0">{value ?? "Not stated"}</dd>
    </div>
  );
}

/** NextJob never receives applications: this only says where to go, and says that it leaves NextJob. */
function Apply({ listing }: { listing: OpportunityDetail }) {
  const { application } = listing;
  if (listing.status !== "published") {
    return (
      <Callout>
        <h2 className="text-title font-strong">Applications</h2>
        <p className="mt-1 text-base">This opportunity is no longer open.</p>
      </Callout>
    );
  }
  return (
    <Callout id="apply" data-testid="apply">
      <h2 className="text-title font-strong">How to apply</h2>
      {application.method === "external_url" && application.url && isHttps(application.url) ? (
        <>
          <p className="mt-1 text-base">
            Applications are made on the issuer&apos;s website. You will leave NextJob; NextJob does not
            receive or track applications.
          </p>
          <a
            href={application.url}
            data-listing-apply
            rel="noopener noreferrer nofollow ugc"
            target="_blank"
            className="mt-3 inline-flex rounded-control min-h-control items-center justify-center border border-accent-solid bg-accent-solid px-3 py-[7px] text-ctl font-medium text-white hover:bg-accent-solid-hover"
          >
            Go to {domainOf(application.url)} (new tab)
          </a>
        </>
      ) : null}
      {application.method === "email" && application.email ? (
        <>
          <p className="mt-1 text-base">Apply by e-mail. NextJob does not receive applications.</p>
          <p className="mt-2 text-base">
            <a href={`mailto:${application.email}`} data-listing-apply className="text-accent underline">
              {application.email}
            </a>
          </p>
        </>
      ) : null}
      {application.method === "instructions" && application.instructions ? (
        <>
          <p className="mt-1 text-small text-muted">
            Follow the issuer&apos;s instructions. NextJob does not receive applications.
          </p>
          <p className="mt-2 whitespace-pre-line text-base">{application.instructions}</p>
        </>
      ) : null}
      {listing.contact_details ? (
        <p className="mt-2 text-small text-muted">Contact: {listing.contact_details}</p>
      ) : null}
    </Callout>
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

function DetailList({ detail }: { detail: Record<string, unknown> }) {
  return (
    <dl className="mt-2 grid gap-3 text-base" data-testid="category-details">
      {Object.entries(detail).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[200px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
          <dt className="text-muted">{humanise(key)}</dt>
          <dd className="m-0">{format(value, key)}</dd>
        </div>
      ))}
    </dl>
  );
}
