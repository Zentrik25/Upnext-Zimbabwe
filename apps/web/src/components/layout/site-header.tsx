import Link from "next/link";
import { Container } from "./container";
import { Logo } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { BRAND } from "@/lib/brand";
import { homeOf } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";
import { MobileMenu, type MenuItem } from "./mobile-menu";
import { PendingSignal } from "@/components/navigation/pending-navigation";

/** The five places the public navigation always offers (D-73). One list feeds the bar and the menu. */
export const PUBLIC_NAV = [
  { href: "/opportunities", label: "Find Jobs" },
  { href: "/categories", label: "Categories" },
  { href: "/locations", label: "Locations" },
  { href: "/guides", label: "Career Guides" },
  { href: "/employers", label: "For Employers" },
] as const;

const bar =
  "inline-flex min-h-[44px] items-center whitespace-nowrap text-ctl text-nav-text hover:text-accent";

export async function SiteHeader() {
  const user = await getCurrentUser();
  // Where this account's own dashboard is (chosen by the API, D-70): the workspace, the employer dashboard or the jobseeker one.
  const dashboard = homeOf(user?.home_path);
  const menuGroups: MenuItem[][] = [
    [
      { href: "/", label: "Home", icon: "home" },
      { href: "/opportunities", label: "Find Jobs", icon: "briefcase" },
      { href: "/categories", label: "Categories", icon: "grid" },
      { href: "/locations", label: "Locations", icon: "pin" },
      { href: "/guides", label: "Career Guides", icon: "doc" },
      { href: "/employers", label: "For Employers", icon: "building" },
    ],
    [
      { href: "/about", label: "About Us", icon: "info" },
      { href: "/contact", label: "Contact Us", icon: "mail" },
    ],
    ...(user
      ? [
          [
            ...(dashboard === "/dashboard"
              ? [{ href: dashboard, label: "Dashboard", icon: "grid" as const }]
              : []),
            { href: "/for-you", label: "For you", icon: "home" as const },
            { href: "/saved", label: "Saved", icon: "bookmark" as const },
            { href: "/account", label: "Account", icon: "user" as const },
          ],
        ]
      : []),
  ];
  return (
    <header className="site-header sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex min-h-[56px] items-center gap-x-6 max-md:justify-between">
        <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex min-h-[44px] items-center">
          <Logo />
          <PendingSignal href="/" />
        </Link>
        <nav aria-label="Primary" className="flex flex-1 items-center gap-x-6 max-md:hidden">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={bar}>
              {item.label}
              <PendingSignal href={item.href} />
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-x-4 max-md:hidden">
          {user ? (
            <>
              {/* A full page load: the dashboards have their own frame, chosen once per page load (app/layout.tsx). */}
              <a href={dashboard} className={bar}>
                Dashboard
              </a>
              <Link href="/saved" className={bar}>
                Saved
              </Link>
              <Link href="/account" className={bar}>
                <span className="sr-only">Account: </span>
                {user.display_name}
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className={bar}>
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-pill bg-accent-solid px-4 text-ctl text-on-accent hover:bg-accent-solid-hover"
              >
                Create account
              </Link>
            </>
          )}
        </div>
        {/* Phones and tablets: search, then the menu. Search appears once, here. */}
        <div className="flex items-center md:hidden">
          <Link
            href="/opportunities"
            aria-label="Search opportunities"
            className="inline-flex h-[44px] w-[44px] items-center justify-center text-ink"
          >
            <Icon name="search" className="h-6 w-6" />
          </Link>
          <MobileMenu groups={menuGroups} signedIn={Boolean(user)} />
        </div>
      </Container>
    </header>
  );
}
