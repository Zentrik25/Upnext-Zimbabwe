import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Container } from "./container";

const LINKS = [
  ["/about", "About"],
  ["/employers", "For employers"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-brand-dark py-8 text-small text-white/70">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span className="text-white">
          {BRAND.name} · {BRAND.tagline}
        </span>
        <nav aria-label="Footer">
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex min-h-[44px] items-center text-brand-dark-text underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
