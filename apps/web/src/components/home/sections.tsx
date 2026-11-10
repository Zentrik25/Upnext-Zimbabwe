import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { LoadingRegion, SkeletonInput, SkeletonLine } from "@/components/ui/skeleton";
import { SearchForm } from "@/components/ui/search-form";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Category, Location } from "@/lib/catalog-types";
import { DEADLINES, EMPLOYMENT, MODES } from "@/lib/filters";
import { VerificationTag } from "@/components/opportunities/parts";

/** Every search control is one outlined box: 40px tall, 14px text, icon on the left (D-53, D-73). */
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

/** Hero frame: headline, one line of supporting text and a slot for the search, on a light-gray field. No
 *  illustration, no decoration and no figures: it holds no data, so it is sent at once and only the search can
 *  be pending. */
export function HeroFrame({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="home-title" className="bg-surface-pale">
      <Container className="py-14 max-sm:py-8">
        <h1 id="home-title" className="m-0 max-w-[18ch] text-hero font-semi text-ink">
          Find your next opportunity.
        </h1>
        <p className="mt-4 max-w-[56ch] text-lead text-muted max-sm:mt-3 max-sm:text-base">
          Discover jobs, internships, graduate programmes and career opportunities across Zimbabwe.
        </p>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 max-sm:mt-6 md:max-w-[880px]">
          {children}
          <QuickLinks />
        </div>
      </Container>
    </section>
  );
}

/** The four shortcuts under the search: white chips with an icon. Static, so they are sent with the headline. */
const QUICK_LINKS: readonly { label: string; href: string }[] = [
  { label: "Jobs", href: "/opportunities?category=jobs" },
  { label: "Internships", href: "/opportunities?category=internships" },
  { label: "Graduate programmes", href: "/opportunities?category=graduate-programmes" },
  { label: "Scholarships", href: "/opportunities?category=scholarships" },
  { label: "Tenders", href: "/opportunities?category=tenders" },
];

function QuickLinks() {
  return (
    <nav aria-label="Quick links">
      <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
        <li className="text-ctl text-muted">Popular:</li>
        {QUICK_LINKS.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="inline-flex min-h-[44px] items-center rounded-pill border border-line bg-surface px-4 text-ctl text-ink hover:bg-surface-pale hover:text-accent"
            >
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
      className="grid gap-3 rounded-feature border border-line bg-surface p-3"
    >
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-3 max-md:grid-cols-1">
        <div>
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
        </div>
        <FilterSelect
          id="home-location"
          name="location"
          label="Location"
          icon="pin"
          all="Location"
          options={places}
        />
        <Button type="submit" className="h-field w-full gap-2 rounded-pill px-6 text-ctl md:w-auto">
          Search Jobs
        </Button>
      </div>
      <details className="group">
        <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-ctl text-link [&::-webkit-details-marker]:hidden">
          <Icon name="sliders" className="h-[18px] w-[18px]" />
          <span className="group-open:hidden">More filters</span>
          <span className="hidden group-open:inline">Fewer filters</span>
        </summary>
        <div className="grid gap-3 pt-1 pb-1 sm:grid-cols-2 md:grid-cols-4">
          <FilterSelect
            id="home-category"
            name="category"
            label="Category"
            icon="grid"
            all="Category"
            options={categories.map((c) => [c.code, c.name] as const)}
          />
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
    </SearchForm>
  );
}

/** What the search form looks like while its lists load: same boxes, same gaps, same button. */
export function HeroSearchSkeleton() {
  return (
    <LoadingRegion
      label="search"
      heading={false}
      className="grid gap-3 rounded-feature border border-line bg-surface p-3"
    >
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-3 max-md:grid-cols-1">
        <SkeletonInput label={false} field="h-field" />
        <SkeletonInput label={false} field="h-field" />
        <div className="h-field w-[140px] rounded-pill bg-line max-md:w-full" />
      </div>
      <div className="flex min-h-[44px] items-center">
        <SkeletonLine className="h-[14px] w-[120px]" />
      </div>
    </LoadingRegion>
  );
}

/** One reassurance card: a lavender icon tile, a bold heading, one short line (or the labels themselves). */
function TrustCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-avatar-bg text-accent"
      >
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-strong leading-title">{title}</h3>
        <div className="mt-1 text-ctl text-muted">{children}</div>
      </div>
    </div>
  );
}

/** What the editorial process really guarantees today (see About and the verification labels). */
export function TrustSection() {
  const levels = ["not_verified", "issuer_verified"] as const;
  return (
    <section aria-labelledby="trust-title" className="py-8 max-sm:py-6">
      <Container>
        <div className="rounded-feature bg-surface-pale p-5 md:p-8">
          <h2 id="trust-title" className="m-0 text-sub">
            How listings are checked
          </h2>
          <p className="mt-1 max-w-[640px] text-ctl text-muted">
            We review each opportunity to keep the platform trustworthy and useful.
          </p>
          <div className="mt-3 grid gap-2.5 md:grid-cols-2 md:gap-3">
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
          href="/guides/apply-safely-and-avoid-scams"
          className="mt-3 flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-surface-pale"
        >
          <Icon name="flag" className="h-6 w-6 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-base leading-title">Seen something wrong?</span>
            <span className="block text-ctl text-muted">
              Open the listing and choose Report this opportunity, or read how to spot a fake vacancy.
            </span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-accent" />
        </Link>
      </Container>
    </section>
  );
}
