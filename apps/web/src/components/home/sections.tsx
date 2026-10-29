import Link from "next/link";
import type { ReactNode } from "react";
import { JobSearchArt } from "@/components/brand/job-search-art";
import { Container } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { CATEGORY_ICON, Icon, type IconName } from "@/components/ui/icons";
import type { Category, Location } from "@/lib/catalog-types";
import { BRAND } from "@/lib/brand";
import { CATEGORY_SUMMARY, EMPLOYMENT } from "@/lib/filters";
import { VERIFICATION } from "@/lib/format";

const FIELD =
  "block min-h-field w-full rounded-control border border-control-border bg-surface pl-10 pr-3 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus";

function IconControl({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      {children}
    </div>
  );
}

/** Hero: headline, one honest sentence, the search that works against the real API and the category shortcuts. */
export function Hero({ categories, locations }: { categories: Category[]; locations: Location[] }) {
  return (
    <section aria-labelledby="home-title" className="border-b border-line bg-surface-pale">
      <Container className="pt-10 pb-8 max-sm:pt-6 max-sm:pb-6">
        <div className="grid grid-cols-[1.15fr_1fr] items-center gap-6 max-md:grid-cols-1">
          <div>
            <p className="text-micro font-mono font-[500] uppercase tracking-eyebrow text-eyebrow">
              Opportunities across Zimbabwe
            </p>
            <h1
              id="home-title"
              className="mt-3 max-w-[560px] text-hero font-strong leading-hero tracking-hero text-ink"
            >
              Find your next opportunity.
            </h1>
            <p className="mt-4 max-w-[520px] text-lead leading-body text-muted">
              Explore jobs, internships, scholarships and more, all in one place. Every listing names its
              source.
            </p>
          </div>
          <JobSearchArt className="mx-auto h-auto w-full max-w-[380px] max-md:max-w-[260px]" />
        </div>

        <form
          action="/opportunities"
          method="get"
          role="search"
          aria-label="Search opportunities"
          className="mt-7 grid gap-3"
        >
          <label htmlFor="home-q" className="sr-only">
            Search by title, organisation or keyword
          </label>
          <IconControl icon="search">
            <input
              id="home-q"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Job title, organisation or keyword"
              className={FIELD}
            />
          </IconControl>
          <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <div>
              <label htmlFor="home-location" className="sr-only">
                Location
              </label>
              <IconControl icon="pin">
                <select id="home-location" name="location" defaultValue="" className={FIELD}>
                  <option value="">Any location</option>
                  {locations
                    .filter((l) => l.kind !== "remote" && l.kind !== "country")
                    .map((l) => (
                      <option key={l.slug} value={l.slug}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </IconControl>
            </div>
            <div>
              <label htmlFor="home-category" className="sr-only">
                Category
              </label>
              <IconControl icon="grid">
                <select id="home-category" name="category" defaultValue="" className={FIELD}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </IconControl>
            </div>
            <div>
              <label htmlFor="home-type" className="sr-only">
                Type of work
              </label>
              <IconControl icon="briefcase">
                <select id="home-type" name="employment_type" defaultValue="" className={FIELD}>
                  <option value="">Any type</option>
                  {EMPLOYMENT.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </IconControl>
            </div>
          </div>
          <Button type="submit" className="min-h-field w-full gap-2">
            <Icon name="search" className="h-[18px] w-[18px]" />
            Find opportunities
          </Button>
        </form>

        {categories.length > 0 ? (
          <nav aria-label="Quick categories" className="mt-5">
            <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
              <li className="shrink-0">
                <Link
                  href="/opportunities"
                  className="flex min-h-[64px] min-w-[96px] flex-col items-center justify-center gap-1 rounded-card border border-border-interest bg-match-bg px-3 text-center text-small text-secondary-text"
                >
                  <Icon name="briefcase" />
                  All
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.code} className="shrink-0">
                  <Link
                    href={`/opportunities?category=${c.code}`}
                    className="flex min-h-[64px] min-w-[96px] flex-col items-center justify-center gap-1 rounded-card border border-border-panel bg-surface px-3 text-center text-small text-ink hover:bg-row-hover"
                  >
                    <Icon name={CATEGORY_ICON[c.code] ?? "grid"} className="h-5 w-5 text-accent" />
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
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
                  <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-control bg-match-bg text-accent">
                    <Icon name={CATEGORY_ICON[category.code] ?? "grid"} />
                  </span>
                  <span className="block text-title font-strong text-ink">{category.name}</span>
                  {CATEGORY_SUMMARY[category.code] ? (
                    <span className="mt-1 block text-base text-muted">{CATEGORY_SUMMARY[category.code]}</span>
                  ) : null}
                  <span className="mt-4 inline-flex min-h-[24px] items-center gap-1 text-ctl text-accent underline">
                    View {category.name.toLowerCase()}
                    <Icon name="arrowRight" className="h-4 w-4" />
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
