import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { PageHeader } from "@/components/content/blocks";
import { CATEGORY_ICON, Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui";
import { listCategories } from "@/lib/catalog";
import { socialFor } from "@/lib/brand";
import { CATEGORY_SUMMARY } from "@/lib/filters";

export const dynamic = "force-dynamic";
const DESCRIPTION =
  "Browse UPNEXT Careers by category: jobs, internships, graduate programmes, scholarships, tenders and grants in Zimbabwe.";
export const metadata: Metadata = {
  title: "Categories",
  description: DESCRIPTION,
  alternates: { canonical: "/categories" },
  ...socialFor("/categories", { title: "Categories", description: DESCRIPTION }),
};

export default async function CategoriesPage() {
  const categories = await listCategories();
  return (
    <>
      <PageHeader
        title="Browse by category"
        intro="Each category opens the list of its current opportunities. Every listing names its source and carries a verification label."
      />
      <Container className="pt-6 pb-[65px]">
        {categories.length === 0 ? (
          <EmptyState as="h2" title="Categories are unavailable">
            The categories could not be loaded. Try again shortly, or{" "}
            <Link href="/opportunities" className="text-accent">
              browse all opportunities
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 md:grid-cols-3">
            {categories.map((category) => (
              <li key={category.code}>
                <Link
                  href={`/opportunities?category=${category.code}`}
                  className="flex h-full min-h-[104px] gap-3 rounded-card border border-border-panel bg-surface p-4 hover:bg-row-hover"
                >
                  <Icon
                    name={CATEGORY_ICON[category.code] ?? "grid"}
                    className="mt-0.5 h-6 w-6 shrink-0 text-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-title leading-title text-ink">{category.name}</span>
                    {CATEGORY_SUMMARY[category.code] ? (
                      <span className="mt-1 block text-ctl text-muted">
                        {CATEGORY_SUMMARY[category.code]}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-ctl text-muted">
          Looking for something specific?{" "}
          <Link href="/opportunities" className="text-accent">
            Search all opportunities
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
