import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmployerShell } from "@/components/employer/shell";
import { getEmployerContext } from "@/lib/employer-context";
import { homeOf } from "@/lib/safe-next";

// The employer dashboard is never indexed and never cached (D-70).
export const metadata: Metadata = {
  title: { default: "Employer dashboard", template: "%s | UPNEXT employers" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The frame of every employer page. A visitor is sent to sign in with a real HTTP redirect before anything is
 * streamed (the pages also redirect, but a page with a loading skeleton can only do that after the response
 * has started). This is a convenience: the API answers every request from the caller's own memberships, so
 * nothing here grants or withholds access.
 */
export default async function EmployerLayout({ children }: { children: ReactNode }) {
  const context = await getEmployerContext();
  if (!context) {
    const path = (await headers()).get("x-pathname") ?? "/employer";
    redirect(`/sign-in?next=${encodeURIComponent(path)}`); // the sign-in page re-checks it (safeNext)
  }
  if (context === "unreachable") return children;
  const { user, organisations, active } = context;
  return (
    <EmployerShell
      user={{ name: user.display_name, email: user.email, homePath: homeOf(user.home_path) }}
      organisations={organisations}
      active={active}
    >
      {children}
    </EmployerShell>
  );
}
