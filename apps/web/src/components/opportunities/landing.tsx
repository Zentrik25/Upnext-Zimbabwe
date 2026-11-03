import Link from "next/link";
import { Container } from "@/components/layout";
import { JsonLd } from "@/components/seo/json-ld";
import { OpportunityRow } from "@/components/opportunities/parts";
import { ButtonLink, EmptyState } from "@/components/ui";
import { CATEGORY_SEO } from "@/lib/category-seo";
import type { OpportunitySummary } from "@/lib/catalog-types";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";

export type LandingLink = { href: string; label: string };

/**
 * A landing page for a real place or working arrangement (ADR-0027). Everything on it comes from real data: the
 * open listings the API returned, the category lists that exist, and the other landing pages that qualify. The
 * introduction states only what is true of this page now (how many open listings it shows), and an empty page says
 * so and offers the full list instead of padding. Every listing row is a crawlable link.
 */
export function LandingView({
  path,
  heading,
  subject,
  rows,
  hasMore,
  seeAllHref,
  others,
  othersLabel,
}: {
  path: string;
  heading: string;
  /** "in Harare" / "that can be done remotely": completes "N open listings …". */
  subject: string;
  rows: OpportunitySummary[];
  hasMore: boolean;
  seeAllHref: string;
  others: LandingLink[];
  othersLabel: string;
}) {
  const categories = Object.entries(CATEGORY_SEO).map(([code, copy]) => ({
    href: `/opportunities?category=${code}`,
    label: copy.heading,
  }));
  return (
    <>
      <JsonLd
        data={breadcrumbFor([
          { name: "Opportunities", url: absolute("/opportunities") },
          { name: heading, url: absolute(path) },
        ])}
      />
      <Container className="pt-8 pb-[65px]">
        <article className="max-w-[760px]" aria-labelledby="landing-title">
          <h1 id="landing-title" className="m-0 text-section font-strong tracking-section">
            {heading}
          </h1>
          {rows.length > 0 ? (
            <p className="mt-2 text-base text-muted" data-testid="landing-intro">
              {hasMore
                ? `The ${rows.length} newest open listings`
                : `${rows.length} open ${rows.length === 1 ? "listing" : "listings"}`}{" "}
              {subject}. Each one names its source and carries a verification label, and you apply on the
              issuer&apos;s own channel. Read{" "}
              <Link href="/guides/apply-safely-and-avoid-scams" className="text-accent underline">
                how to apply safely
              </Link>{" "}
              before you share personal details.
            </p>
          ) : null}
          <h2 className="mt-6 text-title font-strong">Open listings</h2>
          {rows.length > 0 ? (
            <div className="mt-2 border-t border-line" data-testid="landing-listings">
              {rows.map((row) => (
                <OpportunityRow key={row.id} row={row} />
              ))}
            </div>
          ) : (
            <EmptyState as="h3" title={`No open listings ${subject} right now`} className="mt-2">
              New listings are published after review. Browse everything that is open, or{" "}
              <Link href="/alerts" className="text-accent underline">
                set up an alert
              </Link>
              .
            </EmptyState>
          )}
          {hasMore ? (
            <p className="mt-3">
              <ButtonLink variant="secondary" href={seeAllHref}>
                See the full list
              </ButtonLink>
            </p>
          ) : null}
          <nav aria-labelledby="landing-more" className="mt-8">
            <h2 id="landing-more" className="text-title font-strong">
              Browse by category
            </h2>
            <ul className="mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-base">
              {categories.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="text-accent underline">
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {others.length > 0 ? (
            <nav aria-labelledby="landing-others" className="mt-6">
              <h2 id="landing-others" className="text-title font-strong">
                {othersLabel}
              </h2>
              <ul className="mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-base">
                {others.map((o) => (
                  <li key={o.href}>
                    <Link href={o.href} className="text-accent underline">
                      {o.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <p className="mt-6 text-ctl">
            <Link href="/opportunities" className="text-accent underline">
              ← All opportunities
            </Link>
          </p>
        </article>
      </Container>
    </>
  );
}
