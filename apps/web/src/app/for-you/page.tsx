import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout";
import { RecommendedRow } from "@/components/seeker/recommended-row";
import { SeekerNav } from "@/components/seeker/seeker-nav";
import { ButtonLink, Callout, EmptyState, Tabs } from "@/components/ui";
import { listCategories } from "@/lib/catalog";
import { getCurrentUser, getForYou } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "For you", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ForYouPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Ffor-you");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["category", "cursor"]) {
    const value = first(raw[key]);
    if (value) params.set(key, value);
  }
  const [result, categories] = await Promise.all([getForYou(params), listCategories()]);
  const active = params.get("category");
  const tabHref = (code: string | null) => (code ? `/for-you?category=${code}` : "/for-you");
  const tabs = [
    { href: tabHref(null), label: "All", current: !active },
    ...categories.map((c) => ({ href: tabHref(c.code), label: c.name, current: active === c.code })),
  ];

  return (
    <>
      <section aria-labelledby="foryou-title" className="border-b border-line py-[22px]">
        <Container>
          <h1 id="foryou-title" className="text-section font-strong tracking-section">
            For you
          </h1>
          <p className="mt-1 text-base text-muted">
            Open opportunities that match what you told us. These are suggestions, not decisions about whether
            you meet a requirement: always read the listing and apply on the official site.
          </p>
        </Container>
      </section>
      <SeekerNav current="for-you" />
      <Container>
        <Tabs label="For you by category" items={tabs} className="border-t-0" />
      </Container>
      <Container className="pt-[18px] pb-[65px]">
        <h2 className="sr-only">Recommended opportunities</h2>
        {!result.ok ? (
          <div role="alert">
            <EmptyState title="Recommendations are unavailable">
              The service could not be reached. Try again shortly, or{" "}
              <Link href="/opportunities" className="text-accent underline">
                search all opportunities
              </Link>
              .
            </EmptyState>
          </div>
        ) : (
          <>
            <Callout className="mb-4 max-w-[760px]" data-testid="foryou-note">
              {result.data.meta.mode === "newest" ? (
                <p className="text-base">
                  {result.data.meta.fields_filled === 0
                    ? "You have not chosen any preferences yet, so these are the newest open opportunities. "
                    : "Nothing open matches your preferences yet, so these are the newest open opportunities. "}
                  <Link href="/profile" className="text-accent underline">
                    Set your preferences
                  </Link>
                </p>
              ) : (
                <p className="text-base">
                  Ordered by how many of your preferences each listing states, then by closing date.{" "}
                  <Link href="/profile" className="text-accent underline">
                    Adjust your preferences
                  </Link>
                </p>
              )}
              {result.data.meta.suggestions.length > 0 ? (
                <ul className="m-0 mt-2 list-disc pl-5 text-small text-muted">
                  {result.data.meta.suggestions.map((s) => (
                    <li key={s.signal}>{s.text}</li>
                  ))}
                </ul>
              ) : null}
            </Callout>
            {result.data.data.length === 0 ? (
              <EmptyState
                title={active ? "Nothing open in this category" : "No open opportunities right now"}
              >
                Check back soon, or{" "}
                <Link href="/opportunities" className="text-accent underline">
                  search all opportunities
                </Link>
                .
              </EmptyState>
            ) : (
              <>
                <p role="status" className="mb-2 text-ctl text-muted" data-testid="foryou-count">
                  {result.data.page.total !== null
                    ? `${result.data.page.total} ${result.data.page.total === 1 ? "opportunity" : "opportunities"}`
                    : "Showing more"}
                </p>
                <div className="border-t border-line" data-testid="foryou-results">
                  {result.data.data.map((row) => (
                    <RecommendedRow key={row.opportunity.id} row={row} returnTo="/for-you" />
                  ))}
                </div>
                {result.data.page.next_cursor ? (
                  <nav aria-label="Pagination" className="mt-4">
                    <ButtonLink
                      rel="next"
                      variant="secondary"
                      href={`/for-you?${new URLSearchParams({ ...(active ? { category: active } : {}), cursor: result.data.page.next_cursor })}`}
                    >
                      Next page
                    </ButtonLink>
                  </nav>
                ) : null}
              </>
            )}
          </>
        )}
      </Container>
    </>
  );
}
