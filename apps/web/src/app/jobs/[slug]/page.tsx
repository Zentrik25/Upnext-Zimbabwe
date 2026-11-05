import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { Container } from "@/components/layout";
import { OpportunityRow } from "@/components/opportunities/parts";
import { JsonLd } from "@/components/seo/json-ld";
import { ButtonLink, EmptyState, Notice } from "@/components/ui";
import { socialFor } from "@/lib/brand";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { listOpportunities } from "@/lib/catalog";
import { GUIDES } from "@/lib/guides";
import {
  LANDING_PAGES,
  LANDING_REDIRECTS,
  landingIndexable,
  landingMinListings,
  landingPage,
  landingPath,
} from "@/lib/landing-pages";
import { getCurrentUser, getSavedIds } from "@/lib/session";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";
import { unavailable } from "@/lib/unavailable";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 20;

/** Only `cursor` changes what the page shows; any other parameter (utm_*, fbclid, ...) is ignored. */
async function cursorOf(searchParams: Props["searchParams"]): Promise<string | undefined> {
  const raw = (await searchParams).cursor;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? value : undefined;
}

/** One API request per render for the metadata and the page. */
const load = cache((slug: string, cursor: string | undefined) => {
  const query = new URLSearchParams({ collection: slug, limit: String(PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  return listOpportunities(query);
});

/** A consolidated page moves, in one step and without its query (a cursor belongs to the old list), to its target. */
function redirectIfConsolidated(slug: string): void {
  const target = Object.hasOwn(LANDING_REDIRECTS, slug) ? LANDING_REDIRECTS[slug] : undefined;
  if (target) permanentRedirect(target);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  redirectIfConsolidated(slug);
  const page = landingPage(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };
  const cursor = await cursorOf(searchParams);
  const result = await load(slug, cursor);
  // A fault is a server error, never "noindex" (lib/unavailable.ts). A stale or tampered cursor is the visitor's
  // problem, not a fault: that view is simply not indexed.
  if (!result.ok && result.reason !== "invalid-query") unavailable(result.reason);
  const total = result.ok ? (result.data.page.total ?? result.data.data.length) : 0;
  const path = landingPath(slug);
  const canonical = cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;
  const index = !cursor && result.ok && landingIndexable(total, result.data.collection?.duplicate_of);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical },
    ...socialFor(canonical, { title: page.title, description: page.description }),
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * A landing page for one collection of open employment listings (D-68): the heading and what it holds, the real
 * listings (server-rendered, so a crawler reads them in the first response), pagination, and links to the related
 * landing pages, the category lists and the guides.
 */
export default async function LandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  redirectIfConsolidated(slug);
  const page = landingPage(slug);
  if (!page) notFound();
  const cursor = await cursorOf(searchParams);
  const [result, user] = await Promise.all([load(slug, cursor), getCurrentUser()]);
  if (!result.ok && result.reason !== "invalid-query") unavailable(result.reason);
  const rows = result.ok ? result.data.data : [];
  const info = result.ok ? result.data.page : null;
  const total = info?.total ?? rows.length;
  const path = landingPath(slug);
  const savedIds = user && rows.length ? await getSavedIds(rows.map((r) => r.id)) : new Set<string>();
  const others = Object.values(LANDING_PAGES).filter((p) => p.slug !== slug);

  return (
    <>
      <JsonLd
        data={breadcrumbFor([
          { name: "Opportunities", url: absolute("/opportunities") },
          { name: page.heading, url: absolute(path) },
        ])}
      />
      <section aria-labelledby="landing-title" className="border-b border-line py-[22px]">
        <Container>
          <nav aria-label="Breadcrumb" className="mb-2 text-small text-muted">
            {/* In a paragraph, so the link gets the inline-link weight (globals.css, axe link-in-text-block). */}
            <p className="m-0">
              <Link href="/opportunities" className="text-accent underline">
                Opportunities
              </Link>{" "}
              / <span aria-current="page">{page.heading}</span>
            </p>
          </nav>
          <h1 id="landing-title" className="text-section font-strong tracking-section">
            {page.heading}
          </h1>
          <p className="mt-1 max-w-[720px] text-base text-muted">{page.intro}</p>
          <p className="mt-1 text-base text-muted">Applications happen on the issuer&apos;s own channel.</p>
        </Container>
      </section>
      <Container className="grid grid-cols-[1fr_230px] gap-6 pt-[18px] pb-[65px] max-md:grid-cols-1">
        <section aria-labelledby="landing-list-title" className="min-w-0">
          <h2 id="landing-list-title" className="sr-only">
            Open listings
          </h2>
          {!result.ok ? (
            <EmptyState title="This page of results has expired">
              <Link href={path} className="text-accent underline">
                Start again from the first page
              </Link>
              .
            </EmptyState>
          ) : (
            <>
              <p className="tnum mb-2 text-ctl text-muted" data-testid="result-count">
                {cursor
                  ? "Showing more results"
                  : `${total} open ${total === 1 ? "opportunity" : "opportunities"}`}
              </p>
              {rows.length === 0 ? (
                <EmptyState title="No open listings here right now">
                  New listings are added as they are checked.{" "}
                  <Link href={page.broader.href} className="text-accent underline">
                    {page.broader.label}
                  </Link>
                </EmptyState>
              ) : (
                <div className="border-t border-line" data-testid="results">
                  {rows.map((row) => (
                    <OpportunityRow
                      key={row.id}
                      row={row}
                      save={{ signedIn: Boolean(user), saved: savedIds.has(row.id), returnTo: path }}
                    />
                  ))}
                </div>
              )}
              {info?.has_more && info.next_cursor ? (
                <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
                  <ButtonLink
                    rel="next"
                    variant="secondary"
                    href={`${path}?cursor=${encodeURIComponent(info.next_cursor)}`}
                  >
                    Next page
                  </ButtonLink>
                  {cursor ? (
                    <Link
                      href={path}
                      className="inline-flex min-h-[44px] items-center text-ctl text-accent underline"
                    >
                      Back to the first page
                    </Link>
                  ) : null}
                </nav>
              ) : null}
              {rows.length > 0 && total < landingMinListings() ? (
                <p className="mt-4 text-base">
                  <Link href={page.broader.href} className="text-accent underline">
                    {page.broader.label}
                  </Link>
                </p>
              ) : null}
            </>
          )}
          <Notice className="mt-6 rounded-card border border-border-notice">
            <p className="m-0">
              Verification labels describe what UPNEXT checked.{" "}
              <Link href="/guides/apply-safely-and-avoid-scams" className="text-accent underline">
                How to apply safely
              </Link>
            </p>
          </Notice>
        </section>
        <aside aria-labelledby="landing-related" className="text-base">
          <h2 id="landing-related" className="text-title font-strong">
            Related searches
          </h2>
          <ul className="mt-2 grid list-none gap-1.5 p-0">
            {others.map((p) => (
              <li key={p.slug}>
                <Link href={landingPath(p.slug)} className="text-accent underline">
                  {p.heading}
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-title font-strong">Browse by category</h2>
          <ul className="mt-2 grid list-none gap-1.5 p-0">
            {Object.entries(CATEGORY_SEO).map(([code, copy]) => (
              <li key={code}>
                <Link href={`/opportunities?category=${code}`} className="text-accent underline">
                  {copy.heading}
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-title font-strong">Guides</h2>
          <ul className="mt-2 grid list-none gap-1.5 p-0">
            {GUIDES.map((g) => (
              <li key={g.path}>
                <Link href={g.path} className="text-accent underline">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </Container>
    </>
  );
}
