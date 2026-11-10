import type { Metadata } from "next";
import { Container } from "@/components/layout";
import { CategoryCard } from "@/components/public/cards";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";

const TITLE = "Browse opportunities by category";
const DESCRIPTION =
  "Jobs, internships and attachments, graduate trainee programmes, scholarships, tenders and grants in Zimbabwe: choose a category to see its open opportunities.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/categories" },
  ...socialFor("/categories", { title: TITLE, description: DESCRIPTION }),
};

/** The six launch categories, from the same copy the category lists use. Links only: nothing is counted or invented. */
export default function CategoriesPage() {
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
      <ul className="m-0 mt-8 grid list-none grid-cols-3 gap-4 p-0 max-md:grid-cols-2 max-sm:grid-cols-1">
        {Object.keys(CATEGORY_SEO).map((code) => (
          <li key={code}>
            <CategoryCard code={code} />
          </li>
        ))}
      </ul>
    </Container>
  );
}
