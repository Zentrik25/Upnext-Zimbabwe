import Link from "next/link";
import { Icon } from "@/components/workspace/icons";
import { cn } from "@/lib/cn";
import type { ListingCounts } from "@/lib/employer-types";

const CARDS = [
  {
    key: "total",
    label: "Total Opportunities",
    icon: "briefcase",
    tone: "bg-match-bg text-accent",
    href: "/employer/opportunities",
  },
  {
    key: "active",
    label: "Active",
    icon: "check",
    tone: "bg-good-bg text-good",
    href: "/employer/opportunities?status=active",
  },
  {
    key: "drafts",
    label: "Drafts",
    icon: "clock",
    tone: "bg-urgent-bg text-urgent",
    href: "/employer/opportunities?status=draft",
  },
  {
    key: "expired",
    label: "Expired",
    icon: "flag",
    tone: "bg-danger-bg text-danger",
    href: "/employer/opportunities?status=expired",
  },
] as const;

/** The four figures at the top of the dashboard. Every number is a count of the organisation's own listings,
 *  read from the database; each card opens the same list, filtered. */
export function StatCards({ counts }: { counts: ListingCounts }) {
  return (
    <ul
      className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 min-[1100px]:grid-cols-4"
      data-testid="stat-cards"
    >
      {CARDS.map((card) => (
        <li key={card.key}>
          <Link
            href={card.href}
            className="flex items-center gap-4 rounded-card border border-border-panel bg-surface p-4 hover:border-border-interest"
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-12 w-12 flex-none items-center justify-center rounded-feature",
                card.tone,
              )}
            >
              <Icon name={card.icon} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-ctl text-ink">{card.label}</span>
              <span
                className="text-[30px] leading-[1.15] font-light tracking-title tabular-nums text-ink"
                data-testid={`stat-${card.key}`}
              >
                {counts[card.key]}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
