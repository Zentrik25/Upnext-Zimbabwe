import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewArticleForm } from "@/components/workspace/insights/new-article-form";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "New article" };

export default async function NewArticlePage() {
  const session = await requireStaff("/workspace/insights/new");
  if (!can(session, "insights.write")) notFound();
  return (
    <>
      <Link href="/workspace/insights" className="text-ctl text-accent underline">
        ← Back to Articles
      </Link>
      <h1 className="m-0 mt-2 mb-4 text-title font-light tracking-title">New article</h1>
      <NewArticleForm />
    </>
  );
}
