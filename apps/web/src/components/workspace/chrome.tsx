"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NavLogo, Monogram } from "@/components/brand/logo";
import { SignOutButton } from "@/components/account/sign-out-button";
import { applyTheme } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/cn";
import type { StaffSession } from "@/lib/staff-types";
import { Icon } from "./icons";
import { Menu, menuLink } from "./menu";
import { SearchBox } from "./search-box";

type Item = {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  active?: (path: string, params: URLSearchParams) => boolean;
};
type Group = { title: string; items: Item[] };

const LIST = "/workspace/opportunities";
const startsWith = (prefix: string) => (p: string) => p.startsWith(prefix);
const exact = (path: string, wanted: Record<string, string>) => (p: string, q: URLSearchParams) =>
  p === path && Object.entries(wanted).every(([k, v]) => q.get(k) === v);

function groups(session: StaffSession): Group[] {
  const has = (code: string) => session.permissions?.includes(code) ?? false;
  const count = (key: string) => session.attention?.find((r) => r.key === key)?.count ?? 0;
  const out: Group[] = [
    {
      title: "",
      items: [{ label: "Dashboard", href: "/workspace", icon: "home", active: (p) => p === "/workspace" }],
    },
    {
      title: "Opportunities",
      items: [
        {
          label: "All opportunities",
          href: LIST,
          icon: "briefcase",
          active: (p, q) =>
            p.startsWith(LIST) &&
            p !== `${LIST}/new` &&
            !(p === LIST && (q.has("queue") || q.has("status") || q.has("deadline"))),
        },
        ...(has("opp.draft.create")
          ? [
              {
                label: "Create opportunity",
                href: `${LIST}/new`,
                icon: "plus",
                active: (p: string) => p === `${LIST}/new`,
              },
            ]
          : []),
        {
          label: "Drafts",
          href: `${LIST}?status=draft`,
          icon: "file",
          active: exact(LIST, { status: "draft" }),
        },
        {
          label: "Published",
          href: `${LIST}?status=published`,
          icon: "send",
          active: exact(LIST, { status: "published" }),
        },
        {
          label: "Expired",
          href: `${LIST}?status=expired`,
          icon: "clock",
          active: exact(LIST, { status: "expired" }),
        },
      ],
    },
  ];
  const editorial: Item[] = [];
  if (has("opp.review.approve"))
    editorial.push({
      label: "Review queue",
      href: `${LIST}?queue=review`,
      icon: "inbox",
      badge: count("review"),
      active: exact(LIST, { queue: "review" }),
    });
  if (has("opp.publish"))
    editorial.push({
      label: "Ready to publish",
      href: `${LIST}?queue=ready`,
      icon: "check",
      badge: count("ready"),
      active: exact(LIST, { queue: "ready" }),
    });
  if (has("employer.review")) {
    editorial.push({
      label: "Employer submissions",
      href: "/workspace/records/claims",
      icon: "users",
      badge: count("employers"),
      active: startsWith("/workspace/records/claims"),
    });
    editorial.push({
      label: "Employer profiles",
      href: "/workspace/records/profiles",
      icon: "building",
      active: startsWith("/workspace/records/profiles"),
    });
    editorial.push({
      label: "Verifications",
      href: "/workspace/records/verifications",
      icon: "shield",
      active: startsWith("/workspace/records/verifications"),
    });
    editorial.push({
      label: "Employer members",
      href: "/workspace/records/memberships",
      icon: "user",
      active: startsWith("/workspace/records/memberships"),
    });
  }
  if (has("org.create"))
    editorial.push({
      label: "Organisations",
      href: "/workspace/manage/organisations",
      icon: "grid",
      active: startsWith("/workspace/manage/organisations"),
    });
  if (has("report.read"))
    editorial.push({
      label: "Public reports",
      href: "/workspace/records/reports",
      icon: "flag",
      badge: count("reports"),
      active: startsWith("/workspace/records/reports"),
    });
  if (editorial.length) out.push({ title: "Editorial", items: editorial });
  if (has("taxonomy.manage"))
    out.push({
      title: "Content",
      items: [
        {
          label: "Categories",
          href: "/workspace/manage/categories",
          icon: "layers",
          active: startsWith("/workspace/manage/categories"),
        },
        {
          label: "Locations",
          href: "/workspace/manage/locations",
          icon: "pin",
          active: startsWith("/workspace/manage/locations"),
        },
        {
          label: "Sectors",
          href: "/workspace/manage/sectors",
          icon: "tag",
          active: startsWith("/workspace/manage/sectors"),
        },
        {
          label: "Skills",
          href: "/workspace/manage/skills",
          icon: "tag",
          active: startsWith("/workspace/manage/skills"),
        },
      ],
    });
  const reports: Item[] = [];
  if (has("opp.review.approve"))
    reports.push({
      label: "Content health",
      href: "/workspace/content-health",
      icon: "chart",
      active: startsWith("/workspace/content-health"),
    });
  reports.push({
    label: "Activity log",
    href: "/workspace/activity",
    icon: "activity",
    active: (p) => p === "/workspace/activity",
  });
  if (has("audit.read_all"))
    reports.push({
      label: "Audit log",
      href: "/workspace/records/audit",
      icon: "shield",
      active: startsWith("/workspace/records/audit"),
    });
  out.push({ title: "Reports", items: reports });
  const settings: Item[] = [];
  if (has("user.role.grant")) {
    settings.push({
      label: "Users",
      href: "/workspace/records/users",
      icon: "user",
      active: startsWith("/workspace/records/users"),
    });
    settings.push({
      label: "Staff roles",
      href: "/workspace/records/roles",
      icon: "key",
      active: startsWith("/workspace/records/roles"),
    });
  }
  if (has("settings.manage")) {
    settings.push({
      label: "Outgoing e-mail",
      href: "/workspace/records/outbox",
      icon: "mail",
      active: startsWith("/workspace/records/outbox"),
    });
    settings.push({
      label: "E-mail delivery proof",
      href: "/workspace/records/delivery",
      icon: "check",
      active: startsWith("/workspace/records/delivery"),
    });
  }
  if (settings.length) out.push({ title: "Settings", items: settings });
  return out;
}

function initials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

const themeListeners = new Set<() => void>();
function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => void themeListeners.delete(listener);
}
const readTheme = (): "light" | "dark" =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const navItem =
  "flex min-h-[40px] items-center gap-3 rounded-card px-3 py-2 text-ctl text-brand-dark-text hover:bg-white/10 hover:text-white focus-visible:outline-white";

export function Chrome({ session, children }: { session: StaffSession; children: ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const opener = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLDivElement>(null);
  const nav = groups(session);
  const tasks = (session.attention ?? []).filter((r) => r.actionable && r.count > 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => opener.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => firstLink.current?.querySelector<HTMLElement>("a")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  /** Closes the drawer and returns focus to its button once the page is no longer inert. */
  function closeDrawer() {
    setOpen(false);
    window.setTimeout(() => opener.current?.focus(), 0);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    themeListeners.forEach((l) => l());
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-on-accent"
      >
        Skip to main content
      </a>
      <aside
        id="workspace-sidebar"
        aria-label="Staff navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-brand-dark text-brand-dark-text transition-transform motion-reduce:transition-none min-[1100px]:translate-x-0 min-[1100px]:shadow-none",
          open ? "translate-x-0 shadow-deep" : "-translate-x-full max-[1099px]:invisible",
        )}
      >
        <div className="flex h-[64px] flex-none items-center justify-between pr-4 pl-5">
          <Link href="/workspace" className="inline-flex items-center gap-3 text-white">
            <NavLogo className="h-[26px] w-auto" />
            <span className="sr-only">UPNEXT Careers staff home</span>
            <span
              className="rounded-control border border-brand-dark-text/40 px-[6px] py-[2px] text-micro tracking-eyebrow text-brand-dark-text uppercase"
              aria-hidden="true"
            >
              Staff
            </span>
          </Link>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation"
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-control text-white hover:bg-white/10 min-[1100px]:hidden"
          >
            <Icon name="x" />
          </button>
        </div>
        <nav aria-label="Staff" className="flex-1 overflow-y-auto px-3 pt-2 pb-4" ref={firstLink}>
          {nav.map((group, gi) => (
            <div key={group.title || "home"} className={gi > 0 ? "mt-[14px]" : ""}>
              {group.title ? (
                <p
                  id={`ng-${gi}`}
                  className="mx-2 mb-1 text-micro tracking-eyebrow text-brand-dark-text uppercase opacity-80"
                >
                  {group.title}
                </p>
              ) : null}
              <ul aria-labelledby={group.title ? `ng-${gi}` : undefined} className="m-0 list-none p-0">
                {group.items.map((item) => {
                  const active = item.active ? item.active(path, params) : false;
                  const cls = cn(navItem, active && "bg-accent-solid text-on-accent hover:bg-accent-solid");
                  const inner = (
                    <>
                      <Icon name={item.icon} />
                      <span className="min-w-0 flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="min-w-[22px] rounded-control bg-white/15 px-[7px] text-center text-small leading-5 text-on-accent tabular-nums">
                          {item.badge}
                          <span className="sr-only"> waiting</span>
                        </span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cls}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        {inner}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex-none border-t border-white/10 px-4 pt-3 pb-5">
          <a
            href={session.public_url}
            target="_blank"
            rel="noopener"
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-control border border-brand-dark-text/45 text-ctl text-white hover:bg-white/10"
          >
            <Icon name="external" />
            <span>View public site</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </aside>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-overlay min-[1100px]:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      ) : null}

      <div className="min-[1100px]:ml-[264px]" inert={open}>
        <header className="sticky top-0 z-20 flex h-[64px] items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-[12px] sm:px-6 min-[1100px]:px-8">
          <button
            ref={opener}
            type="button"
            onClick={() => setOpen(true)}
            aria-controls="workspace-sidebar"
            aria-expanded={open}
            aria-label="Open navigation"
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-control hover:bg-row-hover min-[1100px]:hidden"
          >
            <Icon name="menu" />
          </button>
          <Link
            href="/workspace"
            aria-label="UPNEXT Careers staff home"
            className="flex-none min-[1100px]:hidden"
          >
            <Monogram className="h-[22px] w-auto" />
          </Link>
          <SearchBox />
          <div className="ml-auto flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-control hover:bg-row-hover"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <Menu
              label={`Notifications${session.task_total ? `: ${session.task_total} waiting for you` : ""}`}
              button={
                <span className="relative inline-flex">
                  <Icon name="bell" />
                  {session.task_total ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-[7px] -right-[9px] min-w-[18px] rounded-control bg-danger px-1 text-center text-micro leading-[18px] text-on-accent tabular-nums"
                    >
                      {session.task_total}
                    </span>
                  ) : null}
                </span>
              }
              panelClassName="w-[min(320px,calc(100vw-24px))] max-sm:-right-16"
            >
              {(close) => (
                <>
                  <p className="m-0 px-[10px] pt-2 pb-[6px] text-small text-muted">Waiting for you</p>
                  {tasks.length ? (
                    <ul className="m-0 list-none p-0">
                      {tasks.map((t) => (
                        <li key={t.key}>
                          {t.href.startsWith("/workspace") ? (
                            <Link href={t.href} onClick={close} className={menuLink}>
                              <Icon name={t.icon} />
                              <span className="flex-1">{t.label}</span>
                              <b className="font-normal text-accent tabular-nums">{t.count}</b>
                            </Link>
                          ) : (
                            <a href={t.href} className={menuLink}>
                              <Icon name={t.icon} />
                              <span className="flex-1">{t.label}</span>
                              <b className="font-normal text-accent tabular-nums">{t.count}</b>
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 px-[10px] pt-2 pb-3 text-ctl text-muted">
                      Nothing is waiting for you right now.
                    </p>
                  )}
                </>
              )}
            </Menu>
            <span aria-hidden="true" className="mx-2 hidden h-7 w-px bg-line sm:block" />
            <Menu
              label={`Account menu for ${session.user.name}`}
              buttonClassName="gap-[10px] px-[6px] py-1"
              button={
                <>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-feature border border-avatar-border bg-avatar-bg text-ctl text-avatar-text"
                  >
                    {initials(session.user.name)}
                  </span>
                  <span className="hidden flex-col text-left leading-[1.2] sm:flex">
                    <span className="text-ctl text-ink">{session.user.name}</span>
                    <span className="text-small text-muted">
                      {session.user.role === "administrator" ? "Administrator" : `Staff ${session.user.role}`}
                    </span>
                  </span>
                  <Icon name="chevron-down" className="hidden h-4 w-4 text-muted sm:block" />
                </>
              }
            >
              <p className="m-0 px-[10px] pt-2 pb-[6px] text-small text-muted">{session.user.name}</p>
              <ul className="m-0 list-none p-0">
                <li>
                  <Link href="/account" className={menuLink}>
                    <Icon name="user" />
                    <span>My account</span>
                  </Link>
                </li>
                <li>
                  <a href={session.public_url} target="_blank" rel="noopener" className={menuLink}>
                    <Icon name="external" />
                    <span>View public site</span>
                  </a>
                </li>
              </ul>
              <div className="mt-[6px] border-t border-line px-[2px] pt-[6px]">
                <SignOutButton />
              </div>
            </Menu>
          </div>
        </header>
        <main
          id="workspace-main"
          tabIndex={-1}
          className="mx-auto max-w-[1480px] px-4 pt-5 pb-12 sm:px-6 sm:pt-6 min-[1100px]:px-8 min-[1100px]:pt-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
