import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "./blocks";
import { cn } from "@/lib/cn";

/** Reading page: a compact header band (title, intro) over one readable column (max 720px). */
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
    <>
      <PageHeader title={title} intro={intro} />
      <Container className="pt-2 pb-[65px]">
        <article className="max-w-[720px]">
          {draft ? (
            <div
              role="note"
              data-testid="draft-notice"
              className="mt-4 rounded-card border border-border-notice bg-surface-notice p-3 text-base"
            >
              <strong>Draft for owner and legal review.</strong> This text has not been approved by the owner
              or reviewed by a lawyer and is not legal advice. Items in [square brackets] are still to be
              decided.
            </div>
          ) : null}
          <div className="grid gap-1">{children}</div>
        </article>
      </Container>
    </>
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
    <section className={cn("mt-6", className)}>
      <h2 className="border-b border-line pb-2 text-[22px] font-strong leading-title tracking-title">
        {title}
      </h2>
      <div className="mt-3 grid gap-3 text-base leading-relaxed">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 list-disc pl-5">
      {items.map((item, index) => (
        <li key={index} className="mt-1.5">
          {item}
        </li>
      ))}
    </ul>
  );
}
