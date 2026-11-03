import Link from "next/link";
import type { ReactNode } from "react";
import { JobSeekerArt } from "@/components/brand/job-seeker-art";
import { Container } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { LoadingRegion, SkeletonInput, SkeletonLine } from "@/components/ui/skeleton";
import { SearchForm } from "@/components/ui/search-form";
import { CATEGORY_ICON, Icon, type IconName } from "@/components/ui/icons";
import type { Category, Location } from "@/lib/catalog-types";
import { DEADLINES, EMPLOYMENT, MODES } from "@/lib/filters";
import { VerificationTag } from "@/components/opportunities/parts";

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

        {/* One lavender panel holds the search (or its skeleton) and the quick links under it. */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-feature bg-match-bg p-3 max-sm:p-2.5 md:max-w-[640px] md:p-4">
          {children}
          <QuickLinks />
        </div>
      </Container>
    </section>
  );
}

/** The four shortcuts under the search: white chips with an icon. Static, so they are sent with the headline. */
const QUICK_LINKS: readonly { label: string; href: string; icon: IconName }[] = [
  { label: "Jobs", href: "/opportunities?category=jobs", icon: "briefcase" },
  { label: "Tenders", href: "/opportunities?category=tenders", icon: "doc" },
  { label: "Scholarships", href: "/opportunities?category=scholarships", icon: "cap" },
  { label: "More", href: "#categories", icon: "grid" },
];

function QuickLinks() {
  return (
    <nav aria-label="Quick links">
      <ul className="m-0 flex list-none justify-between gap-1.5 p-0 max-sm:gap-1">
        {QUICK_LINKS.map((link) => (
          <li key={link.label} className="min-w-0">
            <Link
              href={link.href}
              className="inline-flex min-h-control items-center gap-1.5 rounded-pill bg-surface px-3.5 text-ctl text-ink shadow-subtle hover:shadow-ambient max-sm:gap-1 max-sm:px-2 max-sm:text-[13px] max-[380px]:text-small"
            >
              <Icon
                name={link.icon}
                className="h-[18px] w-[18px] shrink-0 text-ink max-sm:h-3.5 max-sm:w-3.5 max-[340px]:hidden"
              />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
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
      className="grid gap-2.5"
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
      <Button type="submit" className="relative h-[44px] w-full gap-2 text-ctl">
        Find opportunities
        <Icon name="arrowRight" className="h-[18px] w-[18px]" />
      </Button>
    </SearchForm>
  );
}

/** What the search form looks like while its lists load: same boxes, same gaps, same button. */
export function HeroSearchSkeleton() {
  return (
    <LoadingRegion label="search" heading={false} className="grid gap-2.5">
      <SkeletonInput label={false} field="h-field" />
      <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
        <SkeletonInput label={false} field="h-field" />
        <SkeletonInput label={false} field="h-field" />
      </div>
      <div className="flex min-h-[32px] items-center">
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
          <h2 id="categories-title" className="font-headline text-title tracking-title">
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

/** One reassurance card: a lavender icon tile, a bold heading, one short line (or the labels themselves). */
function TrustCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-card bg-surface p-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-avatar-bg text-accent"
      >
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <h3 className="font-headline text-base leading-title">{title}</h3>
        <div className="mt-1 text-ctl text-muted">{children}</div>
      </div>
    </div>
  );
}

/** What the editorial process really guarantees today (see About and the verification labels). */
export function TrustSection() {
  const levels = ["not_verified", "issuer_verified"] as const;
  return (
    <section aria-labelledby="trust-title" className="pb-8">
      <Container>
        <div className="rounded-feature bg-surface-pale p-4 md:p-6">
          <h2 id="trust-title" className="font-headline text-title tracking-title">
            How listings are checked
          </h2>
          <p className="mt-1 max-w-[640px] text-ctl text-muted">
            We review each opportunity to keep the platform trustworthy and useful.
          </p>
          <div className="mt-3 grid gap-2.5 md:grid-cols-3 md:gap-3">
            <TrustCard icon="layers" title="Every listing has a source">
              A listing is only published with a recorded source, such as the organisation, website or
              official notice.
            </TrustCard>
            <TrustCard icon="users" title="An editor reviews it first">
              Our editorial team reviews each listing before it goes live, and any major change is reviewed
              again.
            </TrustCard>
            <TrustCard icon="shield" title="Verification is labelled, not assumed">
              <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                <span>Listings are clearly labelled as</span>
                {levels.map((level, index) => (
                  <span key={level} className="inline-flex items-center gap-1.5">
                    {index === levels.length - 1 ? <span>or</span> : null}
                    <VerificationTag level={level} />
                  </span>
                ))}
              </p>
            </TrustCard>
          </div>
        </div>
        <Link
          href="/opportunities"
          className="mt-3 flex items-center gap-3 rounded-card bg-surface-pale p-3 hover:shadow-ambient"
        >
          <Icon name="flag" className="h-6 w-6 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-base leading-title">Seen something wrong?</span>
            <span className="block text-ctl text-muted">
              Open the listing and choose Report this opportunity. Our team will review it.
            </span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-accent" />
        </Link>
      </Container>
    </section>
  );
}
