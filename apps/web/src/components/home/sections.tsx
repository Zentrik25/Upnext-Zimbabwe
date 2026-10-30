import Link from "next/link";
import type { ReactNode } from "react";
import { JobSeekerArt } from "@/components/brand/job-seeker-art";
import { Container } from "@/components/layout";
import { InfoCard } from "@/components/content/blocks";
import { Button } from "@/components/ui/button";
import { LoadingRegion, SkeletonInput, SkeletonLine } from "@/components/ui/skeleton";
import { SearchForm } from "@/components/ui/search-form";
import { CATEGORY_ICON, Icon, type IconName } from "@/components/ui/icons";
import type { Category, Location } from "@/lib/catalog-types";
import { BRAND } from "@/lib/brand";
import { DEADLINES, EMPLOYMENT, MODES } from "@/lib/filters";
import { VERIFICATION } from "@/lib/format";

/** Every search control is one outlined box: 44px tall, 16px text (no zoom on focus in iOS), icon on the left. */
const FIELD =
  "block min-h-search w-full rounded-control border border-control-border bg-surface pl-11 pr-3 text-base font-light text-ink focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus";
const SELECT = `${FIELD.replace("pr-3", "pr-10")} appearance-none truncate`;

function IconControl({ icon, select, children }: { icon: IconName; select?: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      {children}
      {select ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink">
          <Icon name="chevronDown" className="h-5 w-5" />
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
    <section aria-labelledby="home-title" className="bg-surface-pale">
      <Container className="pt-4 pb-4 md:pt-6 md:pb-8">
        <p className="font-headline text-ctl uppercase tracking-[0.24em] text-accent">Your next chapter</p>
        <div className="mt-1 grid items-center">
          <div className="relative z-10 col-start-1 row-start-1">
            <h1
              id="home-title"
              className="font-headline text-[clamp(28px,8vw,64px)] leading-[1.06] tracking-[-0.035em] text-ink"
            >
              <span className="block whitespace-nowrap">Find your next </span>
              <span className="block text-accent">opportunity </span>
              <span className="block">in Zimbabwe.</span>
            </h1>
            <p className="mt-2 max-w-[min(240px,56vw)] text-ctl leading-snug text-muted md:max-w-none md:text-lead">
              Jobs, internships and opportunities to move you forward.
            </p>
          </div>
          {/* Behind the text, as in the mockup: it takes the right 46% and may touch the end of the headline. */}
          <div className="col-start-1 row-start-1 -mr-[3%] w-[46%] max-w-[460px] justify-self-end">
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
      className="mt-3 grid gap-2.5 md:max-w-[720px]"
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
        <summary className="inline-flex min-h-[32px] cursor-pointer list-none items-center gap-2.5 text-base text-accent [&::-webkit-details-marker]:hidden">
          <Icon name="sliders" className="h-5 w-5" />
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
      <Button type="submit" className="relative min-h-[48px] w-full gap-3 text-base">
        <Icon name="search" className="h-5 w-5" />
        Find opportunities
        <Icon name="arrowRight" className="absolute right-4 h-5 w-5" />
      </Button>
    </SearchForm>
  );
}

/** What the search form looks like while its lists load: same boxes, same gaps, same button. */
export function HeroSearchSkeleton() {
  return (
    <LoadingRegion label="search" heading={false} className="mt-3 grid gap-2.5 md:max-w-[720px]">
      <SkeletonInput label={false} />
      <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
        <SkeletonInput label={false} />
        <SkeletonInput label={false} />
      </div>
      <div className="flex min-h-[22px] items-center">
        <SkeletonLine className="h-[14px] w-[120px]" />
      </div>
      <div className="h-[48px] w-full rounded-control bg-line" />
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="categories-title" className="font-headline text-[20px] tracking-title">
              Explore by category
            </h2>
            <Link
              href="/categories"
              className="inline-flex min-h-[24px] items-center gap-1 text-ctl text-accent"
            >
              All categories
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
          <nav aria-label="Browse by category" className="mt-3">
            <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-sm:gap-2 md:grid-cols-6">
              {categories.map((category) => (
                <li key={category.code}>
                  <Link
                    href={`/opportunities?category=${category.code}`}
                    className="flex min-h-[66px] items-center max-[400px]:min-h-[84px] max-[400px]:flex-col max-[400px]:justify-center max-[400px]:text-center gap-2.5 rounded-control border border-border-panel bg-surface px-3 text-small leading-tight text-ink break-words hover:bg-row-hover max-sm:gap-2 max-sm:px-2.5 sm:text-ctl"
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
  return (
    <section aria-labelledby="trust-title" className="border-b border-line bg-surface-pale py-6 sm:py-8">
      <Container>
        <h2 id="trust-title" className="text-[22px] font-strong tracking-title sm:text-sub">
          How listings are checked
        </h2>
        <p className="mt-2 max-w-[640px] text-base text-muted">
          {BRAND.name} lists opportunities published by other organisations. It does not take applications,
          and it says plainly what has and has not been checked.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InfoCard title="Every listing names its source">
            A listing cannot be published without at least one source. You see where the information came from
            and when it was last looked at.
          </InfoCard>
          <InfoCard title="An editor reviews it first">
            Nobody approves their own work. A second person reviews the exact version that goes live, and any
            later change needs a new review.
          </InfoCard>
          <InfoCard title="Verification is labelled, not assumed">
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {Object.values(VERIFICATION).map((level) => (
                <li key={level.label}>
                  <strong className="text-ink">{level.label}.</strong>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              A listing that is not verified still names its source.{" "}
              <Link href="/about" className="text-accent">
                What the labels mean
              </Link>
              .
            </p>
          </InfoCard>
        </div>
        <p className="mt-4 text-base text-muted">
          Seen something wrong? Every listing has a{" "}
          <strong className="text-ink">Report this opportunity</strong> link. A report is read by staff; it
          does not remove a listing by itself.
        </p>
      </Container>
    </section>
  );
}
