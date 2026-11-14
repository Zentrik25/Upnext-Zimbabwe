import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryManager, type StaffCategory } from "@/components/workspace/insights/category-manager";
import { can, requireStaff, staffJson } from "@/lib/staff";

export const metadata: Metadata = { title: "Article categories" };

export default async function ArticleCategoriesPage() {
  const session = await requireStaff("/workspace/insights/categories");
  if (!can(session, "insights.manage")) notFound();
  const result = await staffJson<{ data: StaffCategory[] }>("insights/categories");
  if (!result.ok) throw new Error("The categories could not be loaded.");
  return (
    <>
      <Link href="/workspace/insights" className="text-ctl text-accent underline">
        ← Back to Articles
      </Link>
      <h1 className="m-0 mt-2 mb-1 text-title font-light tracking-title">Article categories</h1>
      <p className="m-0 mb-4 max-w-[70ch] text-small text-muted">
        Categories group Career Insights articles and each has a public page. A category with no published
        article is not indexed by search engines. Switch a category off instead of removing it.
      </p>
      <CategoryManager categories={result.data.data} />
    </>
  );
}
