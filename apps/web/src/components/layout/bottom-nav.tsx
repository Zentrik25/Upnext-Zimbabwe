"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { PendingSignal } from "@/components/navigation/pending-navigation";

const TABS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" || p === "/dashboard" },
  { href: "/opportunities", label: "Jobs", icon: "briefcase", match: (p) => p.startsWith("/opportunities") },
  { href: "/categories", label: "Categories", icon: "grid", match: (p) => p.startsWith("/categories") },
];
// Private seeker tabs: only for a signed-in account. A visitor sees Guides and Sign in instead (D-73).
const SEEKER_TABS: typeof TABS = [
  { href: "/saved", label: "Saved", icon: "bookmark", match: (p) => p.startsWith("/saved") },
  {
    href: "/account",
    label: "Account",
    icon: "user",
    match: (p) => ["/account", "/profile", "/alerts", "/for-you"].some((x) => p.startsWith(x)),
  },
];
const VISITOR_TABS: typeof TABS = [
  {
    href: "/insights",
    label: "Insights",
    icon: "doc",
    match: (p) => p.startsWith("/insights") || p.startsWith("/guides"),
  },
  { href: "/sign-in", label: "Sign in", icon: "user", match: (p) => p === "/sign-in" },
];

/** Phone-only tab bar for the five places a visitor goes most. Sign-in and registration stay inside the menu.
 *  No prefetching: each tab is a server-rendered page that calls the API, and five prefetches on every page view
 *  would multiply API load (and trip the per-address read limit in the browser suite). */
export function BottomNav({ home = "/", signedIn = false }: { home?: string; signedIn?: boolean }) {
  const pathname = usePathname();
  const tabs = [...TABS, ...(signedIn ? SEEKER_TABS : VISITOR_TABS)];
  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="m-0 grid list-none grid-cols-5 p-0">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.label}>
                <Link
                  href={tab.label === "Home" ? home : tab.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-small",
                    active ? "border-accent-solid text-accent" : "border-transparent text-muted",
                  )}
                >
                  <Icon name={tab.icon} />
                  {tab.label}
                  <PendingSignal href={tab.label === "Home" ? home : tab.href} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* keeps the footer clear of the fixed bar */}
      <div aria-hidden="true" className="h-[calc(58px+env(safe-area-inset-bottom))] sm:hidden" />
    </>
  );
}
