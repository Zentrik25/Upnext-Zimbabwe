import { Suspense, type ReactNode } from "react";
import { StaffShell, type NavGroup } from "@/components/staff/shell";
import { can, requireStaff, staffGet } from "@/lib/staff";
import type { Overview } from "@/lib/staff-types";

const ROLE_LABEL: Record<string, string> = {
  administrator: "Administrator",
  editor: "Editor",
  contributor: "Contributor",
};

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireStaff();
  const overview = await staffGet<Overview>("overview");
  const counts = overview.ok ? overview.data.counts : {};
  const has = (permission: string) => can(session, permission);

  const groups: NavGroup[] = [
    { title: "", items: [{ href: "/staff", label: "Dashboard" }] },
    {
      title: "Opportunities",
      items: [
        { href: "/staff/opportunities", label: "All Opportunities", view: "all" },
        { href: "/staff/opportunities?view=drafts", label: "Drafts", view: "drafts" },
        { href: "/staff/opportunities?view=published", label: "Published", view: "published" },
        { href: "/staff/opportunities?view=expired", label: "Expired", view: "expired" },
      ],
    },
    {
      title: "Editorial",
      items: [
        ...(has("opp.review.approve")
          ? [{ href: "/staff/review", label: "Review Queue", badge: counts.awaiting_my_review ?? null }]
          : []),
        ...(has("employer.review") || has("opp.review.approve")
          ? [
              {
                href: "/staff/submissions",
                label: "Employer Submissions",
                badge: (counts.employer_pending ?? 0) + (counts.pending_claims ?? 0) || null,
              },
            ]
          : []),
        { href: "/staff/organisations", label: "Organisations" },
        ...(has("report.read")
          ? [{ href: "/staff/reports", label: "Reports", badge: counts.open_reports ?? null }]
          : []),
      ],
    },
    ...(has("user.role.grant") || has("audit.read_all") || has("settings.manage")
      ? [
          {
            title: "Administration",
            items: [
              ...(has("user.role.grant") ? [{ href: "/staff/users", label: "Staff Management" }] : []),
              ...(has("audit.read_all") ? [{ href: "/staff/audit", label: "Audit Logs" }] : []),
              ...(has("settings.manage") ? [{ href: "/staff/settings", label: "Settings" }] : []),
            ],
          },
        ]
      : []),
  ];
  const role = session.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ");

  return (
    <Suspense>
      <StaffShell groups={groups} user={{ name: session.user.display_name, role }}>
        {children}
      </StaffShell>
    </Suspense>
  );
}
