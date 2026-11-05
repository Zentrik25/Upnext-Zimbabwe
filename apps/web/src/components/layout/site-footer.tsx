import Link from "next/link";
import { Lockup } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { OPPORTUNITY_DESTINATIONS } from "@/lib/destinations";
import { GUIDES } from "@/lib/guides";
import { Container } from "./container";
import { ThemeToggle } from "./theme-toggle";

const COLUMNS: { title: string; links: readonly (readonly [string, string])[] }[] = [
  {
    // The six opportunity destinations of D-69, each a distinct, descriptive link (lib/destinations.ts).
    title: "Opportunities",
    links: OPPORTUNITY_DESTINATIONS.map((d) => [d.href, d.label] as const),
  },
  {
    title: "Guides",
    links: GUIDES.map((g) => [g.path, g.title] as const),
  },
  {
    title: "Employers",
    links: [
      ["/employers", "For employers"],
      ["/sign-in", "Sign in"],
      ["/employer", "Employer dashboard"],
      ["/employers/register", "Employer registration"],
    ],
  },
  {
    title: "Company",
    links: [
      ["/about", "About"],
      ["/contact", "Contact"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ],
  },
];

const link = "inline-flex min-h-[24px] items-center py-[3px] text-brand-dark-text underline";

export function SiteFooter() {
  return (
    <footer className="bg-brand-dark py-12 text-small text-brand-dark-text max-sm:py-6">
      <Container>
        <div className="grid grid-cols-[1.4fr_3fr] gap-8 max-md:grid-cols-1">
          <div>
            <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block text-white">
              <Lockup className="h-[44px] w-auto max-sm:h-[34px]" />
            </Link>
            <p className="mt-4 max-w-[260px] max-sm:mt-2">{BRAND.tagline}</p>
            <p className="mt-3">
              <a href={`mailto:${BRAND.email}`} className={link}>
                {BRAND.email}
              </a>
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="col-span-3 grid grid-cols-4 gap-8 max-md:col-span-1 max-md:grid-cols-2 max-sm:block max-sm:columns-2 max-sm:gap-x-4"
          >
            {COLUMNS.map((column) => (
              <div key={column.title} className="max-sm:mb-3 max-sm:break-inside-avoid">
                <h2 className="text-small font-strong text-white">{column.title}</h2>
                <ul className="m-0 mt-2 grid list-none gap-1 p-0">
                  {column.links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className={link}>
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 max-sm:mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/20 pt-5">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <ThemeToggle />
        </div>
      </Container>
    </footer>
  );
}
