import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/insights/article-view";
import type { ArticleDetail } from "@/lib/insights-types";
import { STATUS_LABEL, type ArticleStatus } from "@/lib/insights-types";
import { requireStaff, staffJson } from "@/lib/staff";

// A preview is never indexed (and /workspace is disallowed in robots.txt).
export const metadata: Metadata = { title: "Article preview", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

export default async function PreviewArticlePage({ params }: Props) {
  const { id } = await params;
  await requireStaff(`/workspace/insights/${id}/preview`);
  const result = await staffJson<ArticleDetail>(`insights/articles/${encodeURIComponent(id)}/preview`);
  if (!result.ok) {
    if (result.status === 404 || result.status === 403) notFound();
    throw new Error("The preview could not be loaded.");
  }
  const status = result.data.status as ArticleStatus | undefined;
  return (
    <>
      <p
        role="status"
        className="m-0 mb-3 flex flex-wrap items-center gap-3 rounded-card bg-surface-pale px-3 py-2 text-ctl"
      >
        <strong>Preview</strong> of the working copy{status ? ` (${STATUS_LABEL[status]})` : ""}. Readers do
        not see this version until it is approved and published.
        <Link href={`/workspace/insights/${id}/edit`} className="text-accent underline">
          Back to the editor
        </Link>
      </p>
      <div data-surface="public" className="rounded-card border border-line bg-white">
        <ArticleView article={result.data} preview />
      </div>
    </>
  );
}
