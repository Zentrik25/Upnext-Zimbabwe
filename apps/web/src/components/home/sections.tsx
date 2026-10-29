import Link from "next/link";
import type { ReactNode } from "react";
import { JobSearchArt } from "@/components/brand/job-search-art";
import { Container } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/ui/search-form";
import { CATEGORY_ICON, Icon, type IconName } from "@/components/ui/icons";
import type { Category, Location } from "@/lib/catalog-types";
import { BRAND } from "@/lib/brand";
import { EMPLOYMENT } from "@/lib/filters";
import { VERIFICATION } from "@/lib/format";

const FIELD =
  "block min-h-field w-full rounded-control border border-control-border bg-surface pl-10 pr-3 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus";
const FIELD_SM = FIELD.replace("pl-10 pr-3", "pl-9 pr-1 max-sm:pl-8 max-sm:text-small");

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

const CHIP_TONES = [
  "bg-match-bg text-secondary-text border-border-interest",
  "bg-good-bg text-good border-good/30",
  "bg-urgent-bg text-urgent border-urgent/30",
];

/** Hero: headline, one honest sentence, the search that works against the real API and the category shortcuts. */
export function Hero({ categories, locations }: { categories: Category[]; locations: Location[] }) {
  const floating = categories.slice(0, 3);
  const shortcuts = categories.slice(0, 4);
  return (
    <section aria-labelledby="home-title" className="border-b border-line bg-surface-pale">
      <Container className="pt-6 pb-6 max-sm:pt-5">
        <div className="grid grid-cols-[1fr_1fr] items-center gap-4 max-sm:gap-2">
          <div>
            <p className="text-micro font-mono font-[500] uppercase tracking-eyebrow text-eyebrow">
              Opportunities across Zimbabwe
            </p>
            <h1
              id="home-title"
              className="font-headline mt-2 text-display leading-[1.05] tracking-display text-ink max-sm:text-[34px]"
            >
              Find your next opportunity.
            </h1>
            <p className="mt-3 max-w-[460px] text-lead leading-body text-muted max-sm:text-ctl">
              Explore jobs, internships, scholarships and more, all in one place.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-[420px] rounded-feature bg-match-bg p-3 max-sm:p-1">
            <JobSearchArt className="h-auto w-full" />
            <ul className="m-0 list-none p-0" aria-label="Popular categories">
              {floating.map((c, i) => (
                <li
                  key={c.code}
                  className={
                    i === 0
                      ? "absolute top-3 left-0 max-sm:hidden"
                      : i === 1
                        ? "absolute top-[34%] right-0 max-sm:hidden"
                        : "absolute bottom-3 right-3 max-sm:hidden"
                  }
                >
                  <Link
                    href={`/opportunities?category=${c.code}`}
                    className={`inline-flex min-h-[36px] items-center gap-2 rounded-card border px-3 text-small shadow-subtle ${CHIP_TONES[i] ?? CHIP_TONES[0]}`}
                  >
                    <Icon name={CATEGORY_ICON[c.code] ?? "grid"} className="h-4 w-4" />
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <SearchForm
          bare
          action="/opportunities"
          method="get"
          aria-label="Search opportunities"
          className="mt-5 grid gap-3"
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
          <div className="grid grid-cols-3 gap-3 max-sm:gap-2">
            <div>
              <label htmlFor="home-location" className="sr-only">
                Location
              </label>
              <IconControl icon="pin">
                <select id="home-location" name="location" defaultValue="" className={FIELD_SM}>
                  <option value="">Location</option>
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
                <select id="home-category" name="category" defaultValue="" className={FIELD_SM}>
                  <option value="">Category</option>
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
                <select id="home-type" name="employment_type" defaultValue="" className={FIELD_SM}>
                  <option value="">Type</option>
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
        </SearchForm>

        {categories.length > 0 ? (
          <nav aria-label="Quick categories" className="mt-4">
            <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1 md:grid md:grid-cols-6 [&>li]:min-w-[96px] [&>li]:flex-1">
              <li>
                <Link
                  href="/opportunities"
                  className={`${TILE} border-border-interest bg-match-bg text-secondary-text`}
                >
                  <Icon name="briefcase" className="h-6 w-6" />
                  All
                </Link>
              </li>
              {shortcuts.map((c) => (
                <li key={c.code}>
                  <Link
                    href={`/opportunities?category=${c.code}`}
                    className={`${TILE} border-border-panel bg-surface text-ink hover:bg-row-hover`}
                  >
                    <Icon name={CATEGORY_ICON[c.code] ?? "grid"} className="h-6 w-6 text-accent" />
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="#categories"
                  className={`${TILE} border-border-panel bg-surface text-ink hover:bg-row-hover`}
                >
                  <Icon name="grid" className="h-6 w-6 text-accent" />
                  More
                </Link>
              </li>
            </ul>
          </nav>
        ) : null}
      </Container>
    </section>
  );
}

const TILE =
  "flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-card border px-2 text-center text-small leading-tight";

/** Featured categories: one tile per category, same destinations as the list filter. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section id="categories" aria-labelledby="categories-title" className="border-b border-line py-10">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="categories-title" className="font-headline text-sub tracking-sub">
            Featured categories
          </h2>
          <Link
            href="/opportunities"
            className="inline-flex min-h-[24px] items-center gap-1 text-ctl text-accent underline"
          >
            View all
            <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </div>
        <nav aria-label="Browse by category" className="mt-5">
          <ul className="m-0 grid list-none grid-cols-6 gap-3 p-0 max-lg:grid-cols-3 max-sm:grid-cols-2">
            {categories.map((category) => (
              <li key={category.code}>
                <Link
                  href={`/opportunities?category=${category.code}`}
                  className="flex min-h-[112px] flex-col justify-between rounded-card bg-brand-dark p-4 text-white hover:bg-ink"
                >
                  <Icon
                    name={CATEGORY_ICON[category.code] ?? "grid"}
                    className="h-6 w-6 text-brand-dark-text"
                  />
                  <span className="flex items-end justify-between gap-2 text-ctl font-medium leading-tight">
                    {category.name}
                    <Icon name="arrowRight" className="h-4 w-4 shrink-0" />
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
