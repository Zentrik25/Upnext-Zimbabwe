import Link from "next/link";
import { Container } from "./container";
import { Logo } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-line bg-surface">
      <Container className="flex h-[58px] items-center justify-between gap-4 max-sm:h-[55px]">
        <Link href="/" aria-label="UPNEXT home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-[22px] max-sm:gap-[11px]">
          <Link href="/opportunities" className="text-ctl text-nav-text">
            Opportunities
          </Link>
          {user ? (
            <>
              <Link href="/saved" className="text-ctl text-nav-text">
                Saved
              </Link>
              <Link href="/account" className="text-ctl text-nav-text">
                <span className="sr-only">Account: </span>
                {user.display_name}
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="text-ctl text-nav-text">
                Sign in
              </Link>
              <Link href="/register" className="text-ctl font-medium text-accent">
                Create account
              </Link>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
