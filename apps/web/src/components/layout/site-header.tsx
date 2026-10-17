import Link from "next/link";
import { Container } from "./container";
import { Logo } from "@/components/ui";

export function SiteHeader() {
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
          <Link href="/design-system" className="text-ctl text-nav-text">
            Design system
          </Link>
        </nav>
      </Container>
    </header>
  );
}
