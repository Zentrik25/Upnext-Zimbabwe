import Link from "next/link";
import { Container } from "./container";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 rounded-b-card border-b border-line bg-surface/90 backdrop-blur-md">
      <Container className="flex min-h-[58px] flex-wrap items-center justify-between gap-x-4 max-sm:min-h-[55px]">
        <Link href="/" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-end gap-x-[22px] max-sm:gap-x-[11px]"
        >
          <Link
            href="/opportunities"
            className="inline-flex min-h-[44px] items-center text-ctl text-nav-text"
          >
            Opportunities
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
                className="inline-flex min-h-[44px] items-center whitespace-nowrap text-ctl font-medium text-accent"
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
