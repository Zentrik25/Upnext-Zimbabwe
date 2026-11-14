import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/workspace/insights/article-editor";
import type { InsightsMeta, StaffArticle } from "@/lib/insights-types";
import { requireStaff, staffJson } from "@/lib/staff";

export const metadata: Metadata = { title: "Edit article", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

export default async function EditArticlePage({ params }: Props) {
  const { id } = await params;
  await requireStaff(`/workspace/insights/${id}/edit`);
  const [article, meta] = await Promise.all([
    staffJson<StaffArticle>(`insights/articles/${encodeURIComponent(id)}`),
    staffJson<InsightsMeta>("insights/meta"),
  ]);
  if (!article.ok) {
    if (article.status === 404 || article.status === 403) notFound();
    throw new Error("The article could not be loaded.");
  }
  if (!meta.ok) throw new Error("The editor could not be loaded.");
  return (
    <>
      <h1 className="sr-only">Edit article: {article.data.headline}</h1>
      <ArticleEditor initial={article.data} meta={meta.data} />
    </>
  );
}
