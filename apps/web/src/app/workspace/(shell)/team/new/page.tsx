import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteForm } from "@/components/workspace/invite-form";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { TeamList } from "@/lib/team-types";

export const metadata: Metadata = { title: "Invite staff" };

export default async function InvitePage() {
  const session = await requireStaff("/workspace/team/new");
  if (!can(session, "user.role.grant")) notFound();
  const result = await staffJson<TeamList>("team?page_size=1");
  if (!result.ok) {
    if (result.status === 403 || result.status === 404) notFound();
    throw new Error("The form could not be loaded.");
  }
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href="/workspace/team" className="text-accent underline">
          ← Staff management
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-4 text-section font-light tracking-section">Invite staff</h1>
      <InviteForm roles={result.data.roles} />
    </>
  );
}
