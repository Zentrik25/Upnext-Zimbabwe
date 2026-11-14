import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorManager, type StaffAuthor } from "@/components/workspace/insights/author-manager";
import { can, requireStaff, staffJson } from "@/lib/staff";

export const metadata: Metadata = { title: "Author profiles" };

export default async function AuthorProfilesPage() {
  const session = await requireStaff("/workspace/insights/authors");
  if (!can(session, "insights.write") && !can(session, "insights.manage")) notFound();
  const result = await staffJson<{ data: StaffAuthor[] }>("insights/authors");
  if (!result.ok) throw new Error("The author profiles could not be loaded.");
  return (
    <>
      <Link href="/workspace/insights" className="text-ctl text-accent underline">
        ← Back to Articles
      </Link>
      <h1 className="m-0 mt-2 mb-1 text-title font-light tracking-title">Author profiles</h1>
      <p className="m-0 mb-4 max-w-[70ch] text-small text-muted">
        {can(session, "insights.manage") ? "Every person who can write articles. " : "Your own profile. "}
        The name, biography and areas shown on articles. State only what the author has confirmed.
      </p>
      <AuthorManager authors={result.data.data} />
    </>
  );
}
