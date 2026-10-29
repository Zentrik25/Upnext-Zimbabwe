import Link from "next/link";
import { Container } from "./container";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/lib/session";
import { MobileMenu, type MenuItem } from "./mobile-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  // Phones: the places a visitor goes most, then the company pages; signed-in destinations come last.
  const menuGroups: MenuItem[][] = [
    [
      { href: "/", label: "Home", icon: "home" },
      { href: "/opportunities", label: "Jobs", icon: "briefcase" },
      { href: "/opportunities?category=internships", label: "Internships", icon: "users" },
      { href: "/opportunities?category=scholarships", label: "Scholarships", icon: "cap" },
      { href: "/opportunities?category=tenders", label: "Tenders", icon: "doc" },
    ],
    [
      { href: "/employers", label: "For Employers", icon: "building" },
      { href: "/about", label: "About Us", icon: "info" },
      { href: "/contact", label: "Contact Us", icon: "mail" },
    ],
    ...(user
      ? [
          [
            { href: "/for-you", label: "For you", icon: "home" as const },
            { href: "/saved", label: "Saved", icon: "bookmark" as const },
            { href: "/account", label: "Account", icon: "user" as const },
          ],
        ]
      : []),
  ];
  return (
    <header className="sticky top-0 z-40 rounded-b-card border-b border-line bg-surface/90 backdrop-blur-md">
      <Container className="flex min-h-[64px] items-center justify-between gap-x-4 max-sm:min-h-[56px]">
        <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex min-h-[44px] items-center">
          <Logo />
        </Link>
        <MobileMenu groups={menuGroups} signedIn={Boolean(user)} />
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-end gap-x-[22px] max-sm:hidden"
        >
          <Link
            href="/opportunities"
            className="inline-flex min-h-[44px] items-center text-ctl text-nav-text hover:underline"
          >
            Opportunities
          </Link>
          <Link
            href="/employers"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap text-ctl text-nav-text hover:underline max-sm:hidden"
          >
            For employers
          </Link>
          {user ? (
            <>
              <Link
                href="/for-you"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap text-ctl text-nav-text"
              >
                For you
              </Link>
              <Link
                href="/saved"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap text-ctl text-nav-text"
              >
                Saved
              </Link>
              <Link href="/account" className="inline-flex min-h-[44px] items-center text-ctl text-nav-text">
                <span className="sr-only">Account: </span>
                {user.display_name}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap text-ctl text-nav-text"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-control border border-accent-solid bg-accent-solid px-3 text-ctl font-medium text-on-accent hover:border-accent-solid-hover hover:bg-accent-solid-hover"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
