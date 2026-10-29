import Link from "next/link";
import { Monogram } from "@/components/brand/logo";
import { Container } from "@/components/layout";
import { ButtonLink, SearchGroup } from "@/components/ui";
import { Button } from "@/components/ui/button";
import type { Category, Location } from "@/lib/catalog-types";
import { BRAND } from "@/lib/brand";
import { CATEGORY_SUMMARY, EMPLOYMENT } from "@/lib/filters";
import { VERIFICATION } from "@/lib/format";

/** Hero: headline, one honest sentence, and the search that works against the real API. */
export function Hero({ categories, locations }: { categories: Category[]; locations: Location[] }) {
  return (
    <section aria-labelledby="home-title" className="relative overflow-hidden border-b border-line">
      {/* Decorative ruby-to-magenta accent (Stripe design system, hero decoration only): hidden from assistive
          technology and simplified away on phones. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-40 h-[460px] w-[640px] rotate-[16deg] rounded-feature bg-linear-to-br from-ruby/15 via-magenta/15 to-magenta/0 max-md:hidden"
      />
      <Monogram className="pointer-events-none absolute -right-16 -bottom-20 h-[340px] w-auto text-surface-pale max-md:hidden" />
      <Container className="relative pt-16 pb-14 max-sm:pt-10 max-sm:pb-10">
        <p className="text-micro font-mono font-[500] uppercase tracking-eyebrow text-eyebrow">
          Opportunities across Zimbabwe
        </p>
        <h1
          id="home-title"
          className="mt-3 max-w-[760px] text-hero font-strong leading-hero tracking-hero text-ink"
        >
          Your next opportunity starts here.
        </h1>
        <p className="mt-4 max-w-[600px] text-title leading-body text-muted">
          Explore jobs, internships and career opportunities across Zimbabwe, all in one place.
        </p>
        <SearchGroup
          action="/opportunities"
          method="get"
          aria-label="Search opportunities"
          className="mt-8 max-w-none bg-surface"
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
          <label htmlFor="home-category" className="sr-only">
            Category
          </label>
          <SearchGroup.Select id="home-category" name="category" defaultValue="">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SearchGroup.Select>
          <label htmlFor="home-location" className="sr-only">
            Location
          </label>
          <SearchGroup.Select id="home-location" name="location" defaultValue="">
            <option value="">Any location</option>
            {locations
              .filter((l) => l.kind !== "remote" && l.kind !== "country")
              .map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
          </SearchGroup.Select>
          <label htmlFor="home-type" className="sr-only">
            Type of work
          </label>
          <SearchGroup.Select id="home-type" name="employment_type" defaultValue="">
            <option value="">Any type</option>
            {EMPLOYMENT.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SearchGroup.Select>
          <Button type="submit" size="search" className="max-sm:w-full">
            Find opportunities
          </Button>
        </SearchGroup>
        <p className="mt-5">
          <ButtonLink href="#categories" variant="secondary">
            Explore categories
          </ButtonLink>
        </p>
      </Container>
    </section>
  );
}

/** The six categories, with the names the API returns. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section id="categories" aria-labelledby="categories-title" className="border-b border-line py-14">
      <Container>
        <h2 id="categories-title" className="text-display font-strong tracking-display">
          Browse by category
        </h2>
        <p className="mt-2 max-w-[560px] text-base text-muted">
          Six kinds of opportunity, each with the same labelled sources and deadlines.
        </p>
        <nav aria-label="Browse by category" className="mt-6">
          <ul className="m-0 grid list-none grid-cols-3 gap-4 p-0 max-md:grid-cols-2 max-sm:grid-cols-1">
            {categories.map((category) => (
              <li key={category.code}>
                <Link
                  href={`/opportunities?category=${category.code}`}
                  className="group block h-full rounded-card border border-border-panel bg-surface p-5 hover:border-ink hover:bg-row-hover"
                >
                  <span className="block text-title font-strong text-ink">{category.name}</span>
                  {CATEGORY_SUMMARY[category.code] ? (
                    <span className="mt-1 block text-base text-muted">{CATEGORY_SUMMARY[category.code]}</span>
                  ) : null}
                  <span className="mt-4 inline-flex min-h-[24px] items-center text-ctl text-accent underline">
                    View {category.name.toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </section>
  );
}

/** What the editorial process really guarantees today (see About and the verification labels). */
export function TrustSection() {
  const levels = Object.values(VERIFICATION);
  return (
    <section aria-labelledby="trust-title" className="border-b border-line bg-surface-pale py-14">
      <Container>
        <h2 id="trust-title" className="text-display font-strong tracking-display">
          How listings are checked
        </h2>
        <p className="mt-2 max-w-[640px] text-base text-muted">
          {BRAND.name} lists opportunities published by other organisations. It does not take applications,
          and it says plainly what has and has not been checked.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <div className="rounded-card border border-border-panel bg-surface p-5">
            <h3 className="text-title font-strong">Every listing names its source</h3>
            <p className="mt-2 text-base text-muted">
              A listing cannot be published without at least one source. You see where the information came
              from and when it was last looked at.
            </p>
          </div>
          <div className="rounded-card border border-border-panel bg-surface p-5">
            <h3 className="text-title font-strong">An editor reviews it first</h3>
            <p className="mt-2 text-base text-muted">
              Nobody approves their own work. A second person reviews the exact version that goes live, and
              any later change needs a new review.
            </p>
          </div>
          <div className="rounded-card border border-border-panel bg-surface p-5">
            <h3 className="text-title font-strong">Verification is labelled, not assumed</h3>
            <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-base text-muted">
              {levels.map((level) => (
                <li key={level.label}>
                  <strong className="text-ink">{level.label}.</strong>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-base text-muted">
              A listing that is not verified still names its source.{" "}
              <Link href="/about" className="text-accent underline">
                What the labels mean
              </Link>
              .
            </p>
          </div>
        </div>
        <p className="mt-5 text-base text-muted">
          Seen something wrong? Every listing has a{" "}
          <strong className="text-ink">Report this opportunity</strong> link. A report is read by staff; it
          does not remove a listing by itself.
        </p>
      </Container>
    </section>
  );
}

/** The employer portal as it exists: claim, review, post, track. */
export function EmployerSection() {
  return (
    <section aria-labelledby="employer-title" className="bg-brand-dark py-14 text-brand-dark-text">
      <Container className="grid grid-cols-[1.2fr_1fr] items-center gap-10 max-md:grid-cols-1">
        <div>
          <h2 id="employer-title" className="text-display font-strong tracking-display text-white">
            For employers and organisations
          </h2>
          <p className="mt-3 max-w-[560px] text-title text-brand-dark-text">
            Claim your organisation, get it verified by our editors and submit listings for review.
            Applications stay on your own channel.
          </p>
          <p className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/employers" variant="inverse">
              Employer services
            </ButtonLink>
            <ButtonLink href="/employer" variant="outline-inverse">
              Employer sign-in
            </ButtonLink>
          </p>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0 text-base">
          {[
            "Organisation verification by an editor, with the method recorded",
            "Draft, submit and amend listings; an editor publishes them",
            "See each listing's status and its aggregate views and apply clicks",
            "A public company profile once it has been reviewed",
          ].map((line) => (
            <li key={line} className="flex gap-3 border-t border-white/20 pt-3">
              <span aria-hidden="true" className="text-white">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
