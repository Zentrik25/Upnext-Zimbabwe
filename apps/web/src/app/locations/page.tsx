import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { listLocations } from "@/lib/catalog";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
const TITLE = "Browse opportunities by location";
const DESCRIPTION =
  "Choose a town, city or province in Zimbabwe to see its open jobs, internships, graduate programmes and other opportunities.";

/** A directory with no place to show is not a page worth indexing. */
export async function generateMetadata(): Promise<Metadata> {
  const any = (await listLocations()).some((l) => l.slug !== "remote");
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/locations" },
    ...socialFor("/locations", { title: TITLE, description: DESCRIPTION }),
    ...(any ? {} : { robots: { index: false, follow: true } }),
  };
}

const KIND_ORDER = ["country", "province", "city", "town", "region"];
const KIND_LABEL: Record<string, string> = {
  country: "Countrywide",
  province: "Provinces",
  city: "Cities",
  town: "Towns",
  region: "Regions",
};

/** Places come from the catalogue (the same list the search filter uses). "Remote" is a work arrangement, not a place,
 *  so it is not listed here. Each link is the ordinary filtered list (`noindex, follow`, canonical to the plain list). */
export default async function LocationsPage() {
  const places = (await listLocations()).filter((l) => l.slug !== "remote");
  const kinds = [...new Set(places.map((l) => l.kind))].sort(
    (a, b) => ((KIND_ORDER.indexOf(a) + 100) % 100) - ((KIND_ORDER.indexOf(b) + 100) % 100),
  );
  return (
    <Container className="py-10 max-sm:py-6">
      <JsonLd
        data={breadcrumbFor([
          { name: "UPNEXT Careers", url: absolute("/") },
          { name: "Locations", url: absolute("/locations") },
        ])}
      />
      <h1 className="m-0 text-display">{TITLE}</h1>
      <p className="mt-3 max-w-[62ch] text-lead text-muted">{DESCRIPTION}</p>
      {places.length === 0 ? (
        <div className="mt-8">
          <EmptyState as="h2" title="Locations are not available right now">
            You can still search all opportunities and filter by place on the results page.
          </EmptyState>
        </div>
      ) : (
        kinds.map((kind) => (
          <section key={kind} className="mt-8" aria-labelledby={`loc-${kind}`}>
            <h2 id={`loc-${kind}`} className="m-0 mb-3 text-title">
              {KIND_LABEL[kind] ?? kind}
            </h2>
            <ul className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-md:grid-cols-3 max-sm:grid-cols-2">
              {places
                .filter((l) => l.kind === kind)
                .map((l) => (
                  <li key={l.slug}>
                    <Link
                      href={`/opportunities?location=${l.slug}`}
                      className="flex min-h-[44px] items-center rounded-card border border-line bg-surface px-4 text-ctl text-ink hover:bg-surface-pale"
                    >
                      {l.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </Container>
  );
}
