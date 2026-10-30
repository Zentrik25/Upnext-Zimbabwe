import Link from "next/link";
import type { ReactNode } from "react";
import { JobSeekerArt } from "@/components/brand/job-seeker-art";
import { Container } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { LoadingRegion, SkeletonInput, SkeletonLine } from "@/components/ui/skeleton";
import { SearchForm } from "@/components/ui/search-form";
import { CATEGORY_ICON, Icon, type IconName } from "@/components/ui/icons";
import type { Category, Location } from "@/lib/catalog-types";
import { BRAND } from "@/lib/brand";
import { DEADLINES, EMPLOYMENT, MODES } from "@/lib/filters";
import { VERIFICATION } from "@/lib/format";

/** Every search control is one outlined box: 40px tall, 14px text, icon on the left (Stripe form scale, D-53). */
const FIELD =
  "block min-h-field w-full rounded-control border border-control-border bg-surface pl-10 pr-3 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25";
const SELECT = `${FIELD.replace("pr-3", "pr-9")} appearance-none truncate`;

function IconControl({ icon, select, children }: { icon: IconName; select?: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      {children}
      {select ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink">
          <Icon name="chevronDown" className="h-[18px] w-[18px]" />
        </span>
      ) : null}
    </div>
  );
}

function FilterSelect({
  id,
  name,
  label,
  icon,
  all,
  options,
}: {
  id: string;
  name: string;
  label: string;
  icon: IconName;
  all: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <IconControl icon={icon} select>
        <select id={id} name={name} defaultValue="" className={SELECT}>
          <option value="">{all}</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </IconControl>
    </div>
  );
}

/** Hero frame: eyebrow, three-line headline with the middle word in the accent colour, the illustration beside it,
 *  and a slot for the search. It holds no data, so it is sent at once; only the search below it can be pending. */
export function HeroFrame({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="home-title" className="relative isolate overflow-hidden bg-surface">
      {/* The system's ruby-to-magenta accent as hard-edged diagonal bands behind the illustration (decorative). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-24 -z-10 h-[460px] w-[150px] rotate-[28deg] bg-linear-to-b from-magenta to-ruby opacity-25 md:right-[8%] md:w-[230px] md:opacity-30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-6 -z-10 h-[420px] w-[70px] rotate-[28deg] bg-linear-to-b from-ruby to-magenta opacity-20 md:right-[2%] md:w-[110px] md:opacity-25"
      />
      <Container className="pt-5 pb-5 md:pt-10 md:pb-10">
        <div className="grid items-center">
          <div className="relative z-10 col-start-1 row-start-1">
            <h1 id="home-title" className="text-[clamp(30px,8.4vw,56px)] leading-hero tracking-hero text-ink">
              <span className="block whitespace-nowrap">Find your next </span>
              <span className="block text-accent">opportunity </span>
              <span className="block">in Zimbabwe.</span>
            </h1>
            <p className="mt-3 max-w-[min(240px,56vw)] text-ctl leading-snug text-muted md:max-w-none md:text-lead">
              Jobs, internships and opportunities to move you forward.
            </p>
          </div>
          {/* Behind the text, as in the mockup: it takes the right 46% and may touch the end of the headline. */}
          <div className="col-start-1 row-start-1 -mr-[3%] w-[46%] max-w-[420px] justify-self-end">
            <JobSeekerArt priority />
          </div>
        </div>

        {children}
      </Container>
    </section>
  );
}

/** The search form. The search works against the real API; Location and Category are always shown, the rest sit behind
 *  "More filters" (a native disclosure, so it needs no script and its fields are sent whether open or closed).
 *  The two lists come from the API, so this is the part that can be pending. */
export function HeroSearch({ categories, locations }: { categories: Category[]; locations: Location[] }) {
  const places = locations
    .filter((l) => l.kind !== "remote" && l.kind !== "country")
    .map((l) => [l.slug, l.name] as const);
  return (
    <SearchForm
      bare
      action="/opportunities"
      method="get"
      aria-label="Search opportunities"
      className="mt-4 grid gap-2.5 md:max-w-[640px]"
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
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Job title or keyword"
          className={FIELD}
        />
      </IconControl>
      <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
        <FilterSelect
          id="home-location"
          name="location"
          label="Location"
          icon="pin"
          all="Location"
          options={places}
        />
        <FilterSelect
          id="home-category"
          name="category"
          label="Category"
          icon="grid"
          all="Category"
          options={categories.map((c) => [c.code, c.name] as const)}
        />
      </div>
      <details className="group">
        <summary className="inline-flex min-h-[32px] cursor-pointer list-none items-center gap-2 text-ctl text-accent [&::-webkit-details-marker]:hidden">
          <Icon name="sliders" className="h-[18px] w-[18px]" />
          <span className="group-open:hidden">More filters</span>
          <span className="hidden group-open:inline">Fewer filters</span>
        </summary>
        <div className="grid gap-3 pt-1 pb-1 sm:grid-cols-3">
          <FilterSelect
            id="home-type"
            name="employment_type"
            label="Type of work"
            icon="briefcase"
            all="Type of work"
            options={EMPLOYMENT}
          />
          <FilterSelect
            id="home-mode"
            name="work_mode"
            label="Work arrangement"
            icon="building"
            all="Arrangement"
            options={MODES}
          />
          <FilterSelect
            id="home-deadline"
            name="deadline_state"
            label="Deadline"
            icon="calendar"
            all="Deadline"
            options={DEADLINES}
          />
        </div>
      </details>
      <Button type="submit" className="relative min-h-[44px] w-full gap-2 text-ctl">
        Find opportunities
        <Icon name="arrowRight" className="h-[18px] w-[18px]" />
      </Button>
    </SearchForm>
  );
}

/** What the search form looks like while its lists load: same boxes, same gaps, same button. */
export function HeroSearchSkeleton() {
  return (
    <LoadingRegion label="search" heading={false} className="mt-4 grid gap-2.5 md:max-w-[640px]">
      <SkeletonInput label={false} />
      <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
        <SkeletonInput label={false} />
        <SkeletonInput label={false} />
      </div>
      <div className="flex min-h-[22px] items-center">
        <SkeletonLine className="h-[14px] w-[120px]" />
      </div>
      <div className="h-[44px] w-full rounded-control bg-line" />
    </LoadingRegion>
  );
}

/** Explore by category: one outlined tile per category (icon, name), same destinations as the list filter. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section id="categories" aria-labelledby="categories-title" className="pt-5">
      <Container>
        <div className="border-b border-line pb-5">
          <h2 id="categories-title" className="text-title tracking-title">
            Explore by category
          </h2>
          <nav aria-label="Browse by category" className="mt-3">
            <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-sm:gap-2 md:grid-cols-6">
              {categories.map((category) => (
                <li key={category.code}>
                  <Link
                    href={`/opportunities?category=${category.code}`}
                    className="flex min-h-[66px] items-center max-[400px]:min-h-[84px] max-[400px]:flex-col max-[400px]:justify-center max-[400px]:text-center gap-2.5 rounded-control border border-border-panel bg-surface px-3 text-small leading-tight text-ink break-words shadow-subtle hover:shadow-ambient max-sm:gap-2 max-sm:px-2.5 sm:text-ctl"
                  >
                    <Icon
                      name={CATEGORY_ICON[category.code] ?? "grid"}
                      className="h-6 w-6 shrink-0 text-accent max-sm:h-[22px] max-sm:w-[22px]"
                    />
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </section>
  );
}

/** The category tiles while the categories load: six tiles of the real tile size, in the real grid. */
export function CategoryGridSkeleton() {
  return (
    <section aria-label="Explore by category" className="pt-5">
      <Container>
        <LoadingRegion label="categories" heading={false} className="border-b border-line pb-5">
          {/* the real heading is 20px type at the body line height (22px): the slot is as tall, the bar is not */}
          <div className="flex h-[22px] items-center">
            <SkeletonLine className="h-[18px] w-[200px]" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 max-sm:gap-2 md:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="min-h-[66px] rounded-control border border-border-panel bg-surface max-[400px]:min-h-[84px]"
              />
            ))}
          </div>
        </LoadingRegion>
      </Container>
    </section>
  );
}

/** What the editorial process really guarantees today (see About and the verification labels). */
export function TrustSection() {
  const levels = Object.values(VERIFICATION);
  return (
    <section aria-labelledby="trust-title" className="border-b border-line bg-surface-pale py-8">
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
