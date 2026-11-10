import Link from "next/link";
import { Lockup } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { OPPORTUNITY_DESTINATIONS } from "@/lib/destinations";
import { GUIDES } from "@/lib/guides";
import { Container } from "./container";

const COLUMNS: { title: string; links: readonly (readonly [string, string])[] }[] = [
  {
    // Find Jobs first, then the six opportunity destinations of D-69, each a distinct, descriptive link.
    title: "Find opportunities",
    links: [
      ["/categories", "Browse by category"],
      ["/locations", "Browse by location"],
      ...OPPORTUNITY_DESTINATIONS.map((d) => [d.href, d.label] as const),
    ],
  },
  {
    title: "Career guides",
    links: [["/guides", "All career guides"], ...GUIDES.map((g) => [g.path, g.title] as const)],
  },
  {
    title: "Employers",
    links: [
      ["/employers", "For employers"],
      ["/employers/register", "Employer registration"],
      ["/sign-in", "Sign in"],
      ["/employer", "Employer dashboard"],
    ],
  },
  {
    title: "UPNEXT Careers",
    links: [
      ["/about", "About UPNEXT"],
      ["/contact", "Contact or report a job"],
      ["/privacy", "Privacy Policy"],
      ["/terms", "Terms of Use"],
    ],
  },
];

const link = "inline-flex min-h-[24px] items-center py-[3px] text-check-text hover:text-accent";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-pale py-12 text-small text-check-text max-sm:py-6">
      <Container>
        <div className="grid grid-cols-[1.2fr_4fr] gap-8 max-md:grid-cols-1">
          <div>
            <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block text-logo">
              <Lockup className="h-[40px] w-auto max-sm:h-[32px]" />
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
            className="grid grid-cols-4 gap-8 max-md:grid-cols-2 max-sm:block max-sm:columns-2 max-sm:gap-x-4"
          >
            {COLUMNS.map((column) => (
              <div key={column.title} className="max-sm:mb-3 max-sm:break-inside-avoid">
                <h2 className="text-small font-strong text-ink">{column.title}</h2>
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
        <div className="mt-10 border-t border-line pt-5 max-sm:mt-4">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
