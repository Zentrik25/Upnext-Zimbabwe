import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Tag, type TagTone } from "@/components/ui/tag";
import { VERIFICATION } from "@/lib/format";
import type { VerificationLevel } from "@/lib/catalog-types";
import { cn } from "@/lib/cn";

/** Compact page header band: eyebrow, h1, one-sentence intro, optional actions. One per page, directly under the header. */
export function PageHeader({
  eyebrow,
  title,
  intro,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-line bg-surface-pale">
      <Container className="py-6 sm:py-8">
        <div className="max-w-[720px]">
          {eyebrow ? (
            <p className="mb-1 text-small uppercase tracking-eyebrow text-accent">{eyebrow}</p>
          ) : null}
          <h1 className="text-[28px] font-strong leading-[1.15] tracking-section sm:text-section">{title}</h1>
          {intro ? <p className="mt-2 text-base leading-relaxed text-muted sm:text-lead">{intro}</p> : null}
          {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {children}
      </Container>
    </section>
  );
}

/** A titled block of page content with a consistent vertical rhythm. `id` makes it linkable. */
export function ContentSection({
  id,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const heading = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={heading} className={cn("scroll-mt-24 py-6 sm:py-8", className)}>
      <h2 id={heading} className="text-[22px] font-strong tracking-title sm:text-sub">
        {title}
      </h2>
      {lead ? <p className="mt-2 max-w-[680px] text-base text-muted">{lead}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Numbered steps: one ordered list, a 28px numeral and a bold lead-in per step. */
export function ProcessSteps({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="m-0 grid list-none gap-0 p-0">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3 border-b border-line py-3 first:pt-0 last:border-b-0">
          <span
            aria-hidden="true"
            className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-control border border-border-interest bg-match-bg text-ctl text-secondary-text"
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-strong leading-snug text-ink">{step.title}</h3>
            <p className="mt-1 text-base text-muted">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A compact fact block: a heading and short text on a hairline border. Use in grids of two or three, never nested. */
export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-border-panel bg-surface p-4">
      <h3 className="text-base font-strong leading-snug text-ink">{title}</h3>
      <div className="mt-1 text-base text-muted">{children}</div>
    </div>
  );
}

export function InfoGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("grid gap-3", cols === 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
}

const LEVEL_TONE: Record<VerificationLevel, TagTone> = {
  not_verified: "default",
  source_checked: "accent",
  issuer_verified: "good",
};

/** The three verification levels as a compact definition list. Wording comes from `VERIFICATION`, the one source. */
export function VerificationLevels() {
  const levels = ["not_verified", "source_checked", "issuer_verified"] as const;
  return (
    <dl className="m-0 divide-y divide-line rounded-card border border-border-panel">
      {levels.map((level) => (
        <div key={level} className="grid gap-1 p-3 sm:grid-cols-[200px_1fr] sm:gap-4">
          <dt>
            <Tag tone={LEVEL_TONE[level]}>{VERIFICATION[level].label}</Tag>
          </dt>
          <dd className="m-0 text-base text-muted">{VERIFICATION[level].explanation}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Closing call to action band. */
export function PageCTA({
  title,
  children,
  href,
  label,
  secondary,
}: {
  title: string;
  children?: ReactNode;
  href: string;
  label: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="rounded-feature bg-brand-dark p-5 text-brand-dark-text sm:p-6">
      <h2 className="text-[22px] font-strong tracking-title text-white">{title}</h2>
      {children ? <p className="mt-1 max-w-[560px] text-base">{children}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink href={href} variant="inverse">
          {label}
        </ButtonLink>
        {secondary ? (
          <ButtonLink href={secondary.href} variant="outline-inverse">
            {secondary.label}
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-accent">
      {children}
    </Link>
  );
}
