"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; icon: IconName; match: (path: string) => boolean };

/** `home` is where the Home tab goes: the public front page for a visitor, the person's own dashboard once signed in. */
const tabs = (home: string): Tab[] => [
  {
    href: home,
    label: "Home",
    icon: "home",
    match: (p) =>
      home === "/"
        ? p === "/"
        : p === "/" || ["/dashboard", "/for-you", "/workspace", "/employer"].some((x) => p.startsWith(x)),
  },
  { href: "/opportunities", label: "Jobs", icon: "briefcase", match: (p) => p.startsWith("/opportunities") },
  { href: "/opportunities", label: "Categories", icon: "grid", match: () => false },
  { href: "/saved", label: "Saved", icon: "bookmark", match: (p) => p.startsWith("/saved") },
  {
    href: "/account",
    label: "Account",
    icon: "user",
    match: (p) => ["/account", "/profile", "/alerts"].some((x) => p.startsWith(x)),
  },
];

/** Dashboards with their own frame need a full page load (app/layout.tsx chooses the frame once per load). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Tab(allProps: any) {
  const { prefetch: _ignored, ...props } = allProps;
  void _ignored;
  const own = /^\/(employer|workspace)(\/|$)/.test(String(props.href));
  return own ? <a {...props} /> : <Link prefetch={false} {...props} />;
}

/** Phone-only tab bar for the five places a visitor goes most. Sign-in and registration stay inside the menu.
 *  No prefetching: each tab is a server-rendered page that calls the API, and five prefetches on every page view
 *  would multiply API load (and trip the per-address read limit in the browser suite). */
export function BottomNav({ home = "/" }: { home?: string }) {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="m-0 grid list-none grid-cols-5 p-0">
          {tabs(home).map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.label}>
                <Tab
                  href={tab.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-small",
                    active ? "border-accent-solid text-accent" : "border-transparent text-muted",
                  )}
                >
                  <Icon name={tab.icon} />
                  {tab.label}
                </Tab>
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
