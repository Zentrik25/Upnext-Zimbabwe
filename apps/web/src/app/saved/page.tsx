import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SavedRow } from "@/components/opportunities/saved-row";
import { SeekerNav } from "@/components/seeker/seeker-nav";
import { Container } from "@/components/layout";
import { ButtonLink, EmptyState, Tabs } from "@/components/ui";
import { listCategories } from "@/lib/catalog";
import { getCurrentUser, getSaved } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved opportunities", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SavedPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Fsaved");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["category", "cursor"]) {
    const value = first(raw[key]);
    if (value) params.set(key, value);
  }
  const [result, categories] = await Promise.all([getSaved(params), listCategories()]);
  const active = params.get("category");
  const tabHref = (code: string | null) => (code ? `/saved?category=${code}` : "/saved");
  const tabs = [
    { href: tabHref(null), label: "All", current: !active },
    ...categories.map((c) => ({ href: tabHref(c.code), label: c.name, current: active === c.code })),
  ];

  return (
    <>
      <section aria-labelledby="saved-title" className="border-b border-line bg-surface-pale py-5 sm:py-6">
        <Container>
          <h1
            id="saved-title"
            className="text-[28px] font-strong leading-[1.15] tracking-section sm:text-section"
          >
            Saved opportunities
          </h1>
          <p className="mt-1 text-base text-muted">
            Listings you saved, newest first. Closed or withdrawn listings stay here so you can see what
            happened to them.
          </p>
        </Container>
      </section>
      <SeekerNav current="saved" />
      <Container>
        <Tabs label="Saved by category" items={tabs} className="border-t-0" />
      </Container>
      <Container className="pt-[18px] pb-[65px]">
        <h2 className="sr-only">Saved listings</h2>
        {!result.ok ? (
          <div role="alert">
            <EmptyState title="Your saved list is unavailable">
              The service could not be reached. Try again shortly.
            </EmptyState>
          </div>
        ) : result.data.length === 0 ? (
          <EmptyState title={active ? "Nothing saved in this category" : "You have not saved anything yet"}>
            Use the heart on a listing to keep it here.{" "}
            <Link href="/opportunities" className="text-accent">
              Browse opportunities
            </Link>
          </EmptyState>
        ) : (
          <>
            <p role="status" className="mb-2 text-ctl text-muted" data-testid="saved-count">
              {result.total !== null
                ? `${result.total} saved ${result.total === 1 ? "listing" : "listings"}`
                : "Showing more"}
            </p>
            {result.data.some((item) => item.availability !== "open") ? (
              <p className="mb-2 text-small text-muted" data-testid="saved-closed-note">
                {result.data.filter((item) => item.availability === "open").length} open ·{" "}
                {result.data.filter((item) => item.availability !== "open").length} closed or removed on this
                page
              </p>
            ) : null}
            <div className="border-t border-line" data-testid="saved-results">
              {result.data.map((item) => (
                <SavedRow key={item.opportunity_id} item={item} />
              ))}
            </div>
            {result.next ? (
              <nav aria-label="Pagination" className="mt-4">
                <ButtonLink
                  rel="next"
                  variant="secondary"
                  href={`/saved?${new URLSearchParams({ ...(active ? { category: active } : {}), cursor: result.next })}`}
                >
                  Next page
                </ButtonLink>
              </nav>
            ) : null}
          </>
        )}
      </Container>
    </>
  );
}
