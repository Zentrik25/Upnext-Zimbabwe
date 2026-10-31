import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/initials";

export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-feature bg-accent-solid text-title font-light text-on-accent"
    >
      {initialsOf(name)}
    </span>
  );
}

/** One row of the settings list: icon, title, one line of description, chevron. A whole-row link (44px minimum). */
export function SettingsRow({
  href,
  icon,
  title,
  description,
  danger = false,
}: {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "flex min-h-[56px] items-center gap-3 rounded-card border bg-surface px-3 py-3 hover:bg-surface-pale",
        danger ? "border-danger/40" : "border-border-panel",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-card",
          danger ? "bg-danger-bg text-danger" : "bg-surface-pale text-accent",
        )}
      >
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-base font-strong", danger && "text-danger")}>{title}</span>
        <span className="block text-small text-muted">{description}</span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

/** A settings sub-page: back link to the account hub, a title and a one-line description, then the section. */
export function AccountSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Container className="pt-4 pb-[65px]">
      <Link
        href="/account"
        prefetch={false}
        className="inline-flex min-h-[24px] items-center gap-1 text-ctl text-accent"
      >
        <Icon name="arrowLeft" className="h-4 w-4" />
        Account settings
      </Link>
      <h1 className="mt-2 text-section font-strong tracking-section">{title}</h1>
      <p className="mt-1 text-base text-muted">{description}</p>
      <div className="mt-4 grid max-w-[640px] gap-4">{children}</div>
    </Container>
  );
}
