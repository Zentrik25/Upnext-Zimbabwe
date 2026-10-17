import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/cn";

/** Reading page: one narrow column, a title and optional intro. */
export function ProsePage({
  title,
  intro,
  draft = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  /** Legal text awaiting owner and legal review. Always shows the notice below. */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <Container className="pt-8 pb-[65px]">
      <article className="max-w-[720px]">
        <h1 className="text-section font-strong tracking-section">{title}</h1>
        {intro ? <p className="mt-2 text-base text-muted">{intro}</p> : null}
        {draft ? (
          <div
            role="note"
            data-testid="draft-notice"
            className="mt-4 border border-border-notice bg-surface-notice p-3 text-base"
          >
            <strong>Draft for owner and legal review.</strong> This text has not been approved by the owner or
            reviewed by a lawyer and is not legal advice. Items in [square brackets] are still to be decided.
          </div>
        ) : null}
        <div className="mt-2 grid gap-1">{children}</div>
      </article>
    </Container>
  );
}

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5", className)}>
      <h2 className="border-b border-line pb-1 text-title font-strong">{title}</h2>
      <div className="mt-2 grid gap-2 text-base">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 list-disc pl-5">
      {items.map((item, index) => (
        <li key={index} className="mt-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
