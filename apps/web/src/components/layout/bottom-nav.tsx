"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const TABS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  { href: "/opportunities", label: "Jobs", icon: "briefcase", match: (p) => p.startsWith("/opportunities") },
  { href: "/#categories", label: "Categories", icon: "grid", match: () => false },
  { href: "/saved", label: "Saved", icon: "bookmark", match: (p) => p.startsWith("/saved") },
  {
    href: "/account",
    label: "Account",
    icon: "user",
    match: (p) => ["/account", "/dashboard", "/profile", "/alerts", "/for-you"].some((x) => p.startsWith(x)),
  },
];

/** Phone-only tab bar for the five places a visitor goes most. Sign-in and registration stay inside the menu. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface sm:hidden"
      >
        <ul className="m-0 grid list-none grid-cols-5 p-0">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.label}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-small",
                    active ? "border-accent-solid text-accent" : "border-transparent text-muted",
                  )}
                >
                  <Icon name={tab.icon} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* keeps the footer clear of the fixed bar */}
      <div aria-hidden="true" className="h-[58px] sm:hidden" />
    </>
  );
}
