import { notFound } from "next/navigation";
import { UserActions } from "@/components/staff/user-actions";
import { EmptyNote, PageHeader, Pagination } from "@/components/staff/primitives";
import { Button, Tag, TextInput } from "@/components/ui";
import { can, first, requireStaff, staffGet } from "@/lib/staff";
import { words } from "@/lib/staff-format";
import type { Paged, StaffAccount } from "@/lib/staff-types";

export const metadata = { title: "Staff Management" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireStaff();
  if (!can(session, "user.role.grant")) notFound();
  const query = new URLSearchParams();
  for (const key of ["q", "page"]) if (first(params[key])) query.set(key, first(params[key]));
  const result = await staffGet<Paged<StaffAccount> & { manageable_roles: string[] }>(
    `users?${query.toString()}`,
  );
  return (
    <>
      <PageHeader
        title="Staff Management"
        lead="People who hold an editorial role. Contributor and Editor can be granted or revoked here with a written reason; the Administrator role changes only through the audited server command, until second-administrator confirmation is decided (OQ-13)."
      />
      <form
        action="/staff/users"
        method="get"
        role="search"
        aria-label="Find a staff member"
        className="mb-4 flex max-w-[480px] items-end gap-3"
      >
        <div className="grid flex-1 gap-[5px]">
          <label htmlFor="u-q" className="text-ctl font-medium text-check-text">
            Search by name or e-mail
          </label>
          <TextInput id="u-q" name="q" defaultValue={first(params.q)} maxLength={100} />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {!result.ok ? (
        <EmptyNote>The staff list could not be loaded.</EmptyNote>
      ) : result.data.data.length === 0 ? (
        <EmptyNote>No staff member matches.</EmptyNote>
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-card border border-border-panel bg-(--staff-card) shadow-subtle">
            <table className="w-full min-w-[820px] border-collapse text-ctl">
              <caption className="sr-only">Staff accounts</caption>
              <thead className="border-b border-line bg-(--staff-canvas)">
                <tr>
                  {["Name", "Roles", "Two-step", "Status"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left text-small font-medium text-muted">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right text-small font-medium text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.data.data.map((account) => (
                  <tr key={account.id} className="align-top">
                    <td className="px-3 py-3">
                      {account.display_name}
                      <span className="block text-small text-muted">{account.email}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {account.roles.map((r) => (
                          <Tag key={r} tone={r === "administrator" ? "accent" : "default"}>
                            {words(r)}
                          </Tag>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Tag tone={account.two_step_enrolled ? "good" : "urgent"}>
                        {account.two_step_enrolled ? "Set up" : "Not set up"}
                      </Tag>
                    </td>
                    <td className="px-3 py-3">{words(account.status)}</td>
                    <td className="px-3 py-3 text-right">
                      <UserActions
                        account={account}
                        manageable={result.data.manageable_roles}
                        isSelf={account.id === session.user.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.data.page}
            noun="staff members"
            hrefFor={(p) =>
              `/staff/users?${new URLSearchParams({ ...Object.fromEntries(query), page: String(p) }).toString()}`
            }
          />
        </>
      )}
    </>
  );
}
