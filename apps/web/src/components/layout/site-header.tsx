import Link from "next/link";
import { Container } from "./container";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/lib/session";
import { MobileMenu, type MenuItem } from "./mobile-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  // Phones: the same destinations as the header bar, inside the menu.
  const menuItems: MenuItem[] = [
    { href: "/opportunities", label: "Opportunities" },
    { href: "/employers", label: "For employers" },
    ...(user
      ? [
          { href: "/for-you", label: "For you" },
          { href: "/saved", label: "Saved" },
          { href: "/account", label: "Account" },
        ]
      : []),
  ];
  return (
    <header className="sticky top-0 z-40 rounded-b-card border-b border-line bg-surface/90 backdrop-blur-md">
      <Container className="flex min-h-[64px] items-center justify-between gap-x-4 max-sm:min-h-[56px]">
        <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex min-h-[44px] items-center">
          <Logo />
        </Link>
        <MobileMenu items={menuItems} signedIn={Boolean(user)} />
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
