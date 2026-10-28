import Link from "next/link";
import { Lockup } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { Container } from "./container";
import { ThemeToggle } from "./theme-toggle";

const COLUMNS: { title: string; links: readonly (readonly [string, string])[] }[] = [
  {
    title: "Opportunities",
    links: [
      ["/opportunities", "All opportunities"],
      ["/#categories", "Browse by category"],
      ["/sign-in", "Sign in"],
      ["/register", "Create an account"],
    ],
  },
  {
    title: "Employers",
    links: [
      ["/employers", "For employers"],
      ["/employer", "Employer sign-in"],
      ["/employers/register", "Register your organisation"],
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
    <footer className="bg-brand-dark py-12 text-small text-brand-dark-text">
      <Container>
        <div className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-8 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <div>
            <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block text-white">
              <Lockup className="h-[44px] w-auto" />
            </Link>
            <p className="mt-4 max-w-[260px]">{BRAND.tagline}</p>
            <p className="mt-3">
              <a href={`mailto:${BRAND.email}`} className={link}>
                {BRAND.email}
              </a>
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
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
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/20 pt-5">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <ThemeToggle />
        </div>
      </Container>
    </footer>
  );
}
