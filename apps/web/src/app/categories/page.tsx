import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { JsonLd } from "@/components/seo/json-ld";
import { Icon, CATEGORY_ICON } from "@/components/ui/icons";
import { socialFor } from "@/lib/brand";
import { listOpportunities } from "@/lib/catalog";
import { guidesFor } from "@/lib/category-resources";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { CATEGORY_SUMMARY } from "@/lib/filters";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

const TITLE = "Browse opportunities by category";
const DESCRIPTION =
  "Jobs, internships and attachments, graduate trainee programmes, scholarships, tenders and grants in Zimbabwe: choose a category to see its open opportunities.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/categories" },
  ...socialFor("/categories", { title: TITLE, description: DESCRIPTION }),
};

const NEWEST = 3;

type Entry = {
  code: string;
  /** null when the list could not be loaded: then nothing is said about the count, rather than "none". */
  total: number | null;
  newest: { slug: string; title: string; organisation: string }[];
};

/** One small list request per category, all at once: the real number of open listings and the newest few. */
async function entries(): Promise<Entry[]> {
  return Promise.all(
    Object.keys(CATEGORY_SEO).map(async (code) => {
      const result = await listOpportunities(new URLSearchParams({ category: code, limit: String(NEWEST) }));
      if (!result.ok) return { code, total: null, newest: [] };
      return {
        code,
        total: result.data.page.total ?? result.data.data.length,
        newest: result.data.data.slice(0, NEWEST).map((r) => ({
          slug: r.slug,
          title: r.title,
          organisation: r.organisation.name,
        })),
      };
    }),
  );
}

/**
 * The six launch categories (D-74): what each holds, how many listings are open now (from the API, never estimated),
 * links to the newest ones and the guides that help, all in the first HTML. An empty category says so plainly instead
 * of looking like it has content; a category whose list could not be loaded shows no count at all.
 */
export default async function CategoriesPage() {
  const all = await entries();
  return (
    <Container className="py-10 max-sm:py-6">
      <JsonLd
        data={breadcrumbFor([
          { name: "UPNEXT Careers", url: absolute("/") },
          { name: "Categories", url: absolute("/categories") },
        ])}
      />
      <h1 className="m-0 text-display">{TITLE}</h1>
      <p className="mt-3 max-w-[62ch] text-lead text-muted">{DESCRIPTION}</p>
      <ul className="m-0 mt-8 grid list-none grid-cols-2 gap-4 p-0 max-md:grid-cols-1">
        {all.map((entry) => (
          <li key={entry.code}>
            <CategoryEntry entry={entry} />
          </li>
        ))}
      </ul>
    </Container>
  );
}

function CategoryEntry({ entry }: { entry: Entry }) {
  const copy = CATEGORY_SEO[entry.code]!;
  const href = `/opportunities?category=${entry.code}`;
  const id = `cat-${entry.code}`;
  const guide = guidesFor(entry.code)[0];
  return (
    <section
      aria-labelledby={id}
      data-testid={`category-${entry.code}`}
      className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-5"
    >
      <Icon name={CATEGORY_ICON[entry.code] ?? "grid"} className="h-6 w-6 text-accent" />
      <h2 id={id} className="m-0 text-title font-strong text-ink">
        <Link href={href} className="hover:underline">
          {copy.heading}
        </Link>
      </h2>
      <p className="m-0 text-ctl text-muted">{CATEGORY_SUMMARY[entry.code] ?? copy.description}</p>
      {entry.total === null ? null : entry.total === 0 ? (
        <p className="m-0 text-ctl text-muted" data-testid="category-count">
          No open listings right now. New opportunities are added as they are checked.
        </p>
      ) : (
        <>
          <p className="m-0 text-ctl font-strong text-ink" data-testid="category-count">
            {entry.total === 1 ? "1 open listing" : `${entry.total} open listings`}
          </p>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {entry.newest.map((row) => (
              <li key={row.slug} className="text-ctl">
                <Link href={`/opportunities/${row.slug}`} className="text-accent underline">
                  {row.title}
                </Link>
                <span className="text-muted"> · {row.organisation}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="m-0 mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-ctl">
        <Link href={href} className="text-link">
          {entry.total ? "View all" : "Open the list"}
          <span className="sr-only"> {copy.heading.toLowerCase()}</span>
        </Link>
        {guide ? (
          <Link href={guide.path} className="text-link">
            {guide.title}
          </Link>
        ) : null}
      </p>
    </section>
  );
}
