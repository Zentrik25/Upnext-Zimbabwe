import { Container } from "@/components/layout";
import { Button, Notice, Panel, SearchGroup, Tag } from "@/components/ui";
import { getApiRoot } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const api = await getApiRoot();
  return (
    <>
      <Notice>
        Every listing names its source. Accounts, saved items and alerts arrive in a later phase.
      </Notice>
      <section aria-labelledby="home-title" className="border-b border-line py-[30px] max-sm:py-6">
        <Container>
          <p className="text-micro font-semi uppercase tracking-eyebrow text-eyebrow">
            Opportunity discovery for Zimbabwe
          </p>
          <h1 id="home-title" className="mt-2 mb-[6px] text-hero font-strong leading-hero tracking-hero">
            Discover what&apos;s next.
          </h1>
          <p className="text-base text-muted">
            Jobs, internships, graduate programmes, scholarships, tenders and grants in one place.
          </p>
          <SearchGroup
            action="/opportunities"
            method="get"
            aria-label="Search opportunities"
            className="mt-4"
          >
            <label htmlFor="home-q" className="sr-only">
              Search by title, organisation or keyword
            </label>
            <SearchGroup.Input
              id="home-q"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Title, organisation or keyword"
            />
            <Button type="submit" size="search">
              Search
            </Button>
          </SearchGroup>
        </Container>
      </section>
      <Container className="pt-[22px] pb-[65px]">
        <Panel className="max-w-[420px]" data-testid="service-status">
          <h2 className="text-title font-strong">Service status</h2>
          <p className="mt-2 flex items-center gap-2 text-base text-ink">
            API
            {api.ok ? (
              <Tag tone="good">Connected · {api.data.version}</Tag>
            ) : (
              <Tag tone="urgent">Unavailable</Tag>
            )}
          </p>
        </Panel>
      </Container>
    </>
  );
}
