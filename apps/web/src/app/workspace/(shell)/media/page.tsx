import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MediaLibrary } from "@/components/workspace/media-library";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Media Library" };

export default async function MediaPage() {
  const session = await requireStaff("/workspace/media");
  if (!can(session, "opp.draft.create") && !can(session, "opp.draft.edit_own")) notFound();
  return (
    <>
      <h1 className="m-0 mb-1 text-title font-light tracking-title">Media Library</h1>
      <p className="m-0 mb-4 max-w-[60ch] text-base text-muted">
        Pictures are stored once and can be used on any number of listings. Taking a picture off a listing
        never deletes it from here.
      </p>
      <MediaLibrary />
    </>
  );
}
