"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { SignOutButton } from "@/components/account/sign-out-button";
import { Monogram, NavLogo } from "@/components/brand/logo";
import { applyTheme } from "@/components/layout/theme-toggle";
import { Icon } from "@/components/workspace/icons";
import { Menu, menuLink } from "@/components/workspace/menu";
import { cn } from "@/lib/cn";
import type { EmployerOrganisation } from "@/lib/employer-types";
import { initialsOf } from "@/lib/initials";

type Item = {
  label: string;
  href: string;
  icon: string;
  active: (path: string, q: URLSearchParams) => boolean;
};

const LIST = "/employer/opportunities";

/** The seven places of the employer dashboard (D-70). Team Members is not here: an organisation's members are
 *  granted by staff when a claim is approved, and no employer-managed team exists to show. */
export function employerNav(active: EmployerOrganisation | null): Item[] {
  if (!active) {
    return [
      { label: "Dashboard", href: "/employer", icon: "home", active: (p) => p === "/employer" },
      {
        label: "Claim an organisation",
        href: "/employer/claim",
        icon: "building",
        active: (p) => p === "/employer/claim",
      },
      {
        label: "Settings",
        href: "/employer/settings",
        icon: "gear",
        active: (p) => p === "/employer/settings",
      },
    ];
  }
  return [
    { label: "Dashboard", href: "/employer", icon: "home", active: (p) => p === "/employer" },
    {
      label: "Opportunities",
      href: LIST,
      icon: "briefcase",
      active: (p, q) =>
        (p === LIST && !q.has("status")) || (p.startsWith("/employer/listings/") && !p.endsWith("/new")),
    },
    {
      label: "Create Opportunity",
      href: "/employer/listings/new",
      icon: "plus",
      active: (p) => p === "/employer/listings/new",
    },
    {
      label: "Drafts",
      href: `${LIST}?status=draft`,
      icon: "file",
      active: (p, q) => p === LIST && q.get("status") === "draft",
    },
    {
      label: "Analytics",
      href: "/employer/analytics",
      icon: "chart",
      active: (p) => p === "/employer/analytics",
    },
    {
      label: "Company Profile",
      href: `/employer/organisations/${active.id}/profile`,
      icon: "building",
      active: (p) => p.startsWith("/employer/organisations/"),
    },
    {
      label: "Settings",
      href: "/employer/settings",
      icon: "gear",
      active: (p) => p === "/employer/settings",
    },
  ];
}

const HEADINGS: [RegExp, string, string][] = [
  [/^\/employer$/, "Employer Dashboard", "Manage your opportunities and track performance."],
  [
    /^\/employer\/opportunities$/,
    "Opportunities",
    "Every listing of your organisation and where it is in review.",
  ],
  [/^\/employer\/analytics$/, "Analytics", "Views and apply clicks for your listings."],
  [
    /^\/employer\/listings\/new$/,
    "Create Opportunity",
    "Save a draft at any time. Editors review it before it is public.",
  ],
  [
    /^\/employer\/listings\/[^/]+\/preview$/,
    "Preview",
    "How this version will look to visitors once it is published.",
  ],
  [/^\/employer\/listings\/[^/]+$/, "Opportunity", "Edit, submit and follow the review of this listing."],
  [
    /^\/employer\/organisations\/[^/]+\/profile$/,
    "Company Profile",
    "The text shown on your public company page.",
  ],
  [/^\/employer\/settings$/, "Settings", "Your account, organisation and notifications."],
  [
    /^\/employer\/claim$/,
    "Claim an organisation",
    "Ask to act for your organisation. Editors check every claim.",
  ],
];

const themeListeners = new Set<() => void>();
const subscribeTheme = (listener: () => void) => {
  themeListeners.add(listener);
  return () => void themeListeners.delete(listener);
};
const readTheme = (): "light" | "dark" =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const navItem =
  "flex min-h-[40px] items-center gap-3 rounded-card px-3 py-2 text-ctl text-brand-dark-text hover:bg-white/10 hover:text-white focus-visible:outline-white";

export type ShellUser = { name: string; email: string; homePath: string };

/** The employer workspace frame: dark navy sidebar, top bar and a drawer on small screens. Same family of
 *  design as the staff workspace (components/workspace/chrome.tsx), with the employer's own seven places. */
export function EmployerShell({
  user,
  organisations,
  active,
  children,
}: {
  user: ShellUser;
  organisations: EmployerOrganisation[];
  active: EmployerOrganisation | null;
  children: ReactNode;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const opener = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const items = employerNav(active);
  const heading = HEADINGS.find(([pattern]) => pattern.test(path)) ?? HEADINGS[0]!;
  const attention = active?.counts.changes_requested ?? 0;
  const notes: { label: string; count: number; href: string }[] = active
    ? [
        {
          label: "Sent back with changes to make",
          count: active.counts.changes_requested,
          href: `${LIST}?status=changes`,
        },
        {
          label: "Waiting for editors to review",
          count: active.counts.in_review,
          href: `${LIST}?status=review`,
        },
        { label: "Drafts not yet submitted", count: active.counts.drafts, href: `${LIST}?status=draft` },
      ].filter((n) => n.count > 0)
    : [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => opener.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => nav.current?.querySelector<HTMLElement>("a")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  function closeDrawer() {
    setOpen(false);
    window.setTimeout(() => opener.current?.focus(), 0);
  }
  function toggleTheme() {
    applyTheme(theme === "dark" ? "light" : "dark");
    themeListeners.forEach((l) => l());
  }

  return (
    <div className="min-h-screen bg-surface text-ink" data-testid="employer-shell">
      <a
        href="#employer-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-on-accent"
      >
        Skip to main content
      </a>
      <aside
        id="employer-sidebar"
        aria-label="Employer navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-brand-dark text-brand-dark-text transition-transform motion-reduce:transition-none min-[1100px]:translate-x-0 min-[1100px]:shadow-none",
          open ? "translate-x-0 shadow-deep" : "-translate-x-full max-[1099px]:invisible",
        )}
      >
        <div className="flex h-[64px] flex-none items-center justify-between pr-4 pl-5">
          <Link href="/employer" className="inline-flex items-center text-white">
            <NavLogo className="h-[26px] w-auto" />
            <span className="sr-only">UPNEXT Careers employer dashboard</span>
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
        <nav aria-label="Employer" ref={nav} className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
          <ul className="m-0 grid list-none gap-1 p-0">
            {items.map((item) => {
              const current = item.active(path, params);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(navItem, current && "bg-accent-solid text-on-accent hover:bg-accent-solid")}
                  >
                    <Icon name={item.icon} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex-none border-t border-white/10 px-3 pt-3 pb-4">
          {active ? (
            <Menu
              // The name starts with the visible words (WCAG 2.5.3), then says what the button does.
              label={`${active.name} ${active.role === "owner" ? "Employer" : "Recruiter"}${active.verified ? "" : " · verification withdrawn"}. ${organisations.length > 1 ? "Switch organisation" : "Your organisation"}`}
              align="left"
              buttonClassName="w-full justify-start gap-3 rounded-card border border-brand-dark-text/45 px-3 py-2 text-left text-white hover:bg-white/10"
              panelClassName="bottom-[calc(100%+6px)] top-auto w-[calc(100%)] min-w-[220px]"
              button={
                <>
                  <span
                    aria-hidden="true"
                    data-initials={initialsOf(active.name)}
                    className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-control border border-white/30 text-ctl text-white after:content-[attr(data-initials)]"
                  />
                  <span
                    className="flex min-w-0 flex-1 flex-col leading-[1.25]"
                    data-testid="active-organisation"
                  >
                    <span className="truncate text-ctl">{active.name}</span>{" "}
                    <span className="text-small text-brand-dark-text">
                      {active.role === "owner" ? "Employer" : "Recruiter"}
                      {active.verified ? "" : " · verification withdrawn"}
                    </span>
                  </span>
                  <Icon name="chevron-down" className="h-4 w-4 flex-none" />
                </>
              }
            >
              {(close) => (
                <div>
                  <p className="m-0 px-[10px] pt-2 pb-[6px] text-small text-muted">
                    {organisations.length > 1 ? "Work for another organisation" : "Your organisation"}
                  </p>
                  <ul className="m-0 list-none p-0">
                    {organisations.map((org) => (
                      <li key={org.id}>
                        <a
                          href={`/employer/switch?org=${org.id}&next=%2Femployer`}
                          onClick={close}
                          aria-current={org.id === active.id ? "true" : undefined}
                          className={cn(menuLink, org.id === active.id && "bg-match-bg")}
                        >
                          <Icon name="building" />
                          <span className="min-w-0 flex-1 truncate">{org.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Menu>
          ) : (
            <p className="m-0 px-2 text-small text-brand-dark-text">No organisation yet</p>
          )}
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
        <header className="sticky top-0 z-20 flex min-h-[72px] items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-[12px] sm:px-6 min-[1100px]:px-8">
          <button
            ref={opener}
            type="button"
            onClick={() => setOpen(true)}
            aria-controls="employer-sidebar"
            aria-expanded={open}
            aria-label="Open navigation"
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-control hover:bg-row-hover min-[1100px]:hidden"
          >
            <Icon name="menu" />
          </button>
          <Link
            href="/employer"
            aria-label="UPNEXT Careers employer dashboard"
            className="hidden flex-none sm:block min-[1100px]:hidden"
          >
            <Monogram className="h-[22px] w-auto" />
          </Link>
          <div className="min-w-0 py-2">
            <h1 className="m-0 text-[18px] leading-[1.2] font-strong tracking-title sm:truncate sm:text-[22px]">
              {heading[1]}
            </h1>
            <p className="m-0 hidden truncate text-ctl text-muted sm:block">{heading[2]}</p>
          </div>
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
              label={`Notifications${attention ? `: ${attention} need your attention` : ""}`}
              button={
                <span className="relative inline-flex">
                  <Icon name="bell" />
                  {attention ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-[7px] -right-[9px] min-w-[18px] rounded-control bg-accent-solid px-1 text-center text-micro leading-[18px] text-on-accent tabular-nums"
                    >
                      {attention}
                    </span>
                  ) : null}
                </span>
              }
              panelClassName="w-[min(320px,calc(100vw-24px))] max-sm:-right-16"
            >
              {(close) => (
                <>
                  <p className="m-0 px-[10px] pt-2 pb-[6px] text-small text-muted">Needs your attention</p>
                  {notes.length ? (
                    <ul className="m-0 list-none p-0">
                      {notes.map((n) => (
                        <li key={n.label}>
                          <Link href={n.href} onClick={close} className={menuLink}>
                            <span className="flex-1">{n.label}</span>
                            <b className="font-normal text-accent tabular-nums">{n.count}</b>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 px-[10px] pt-2 pb-3 text-ctl text-muted">
                      Nothing needs your attention.
                    </p>
                  )}
                  <p className="m-0 border-t border-line px-[10px] pt-2 pb-2 text-small text-muted">
                    Review decisions are also sent by e-mail once e-mail delivery is switched on.
                  </p>
                </>
              )}
            </Menu>
            <span aria-hidden="true" className="mx-2 hidden h-7 w-px bg-line sm:block" />
            <Menu
              label={`Account menu for ${user.name}`}
              buttonClassName="gap-[10px] px-[6px] py-1"
              button={
                <>
                  <span
                    aria-hidden="true"
                    data-initials={initialsOf(user.name)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-feature border border-avatar-border bg-avatar-bg text-ctl text-avatar-text after:content-[attr(data-initials)]"
                  />
                  <Icon name="chevron-down" className="hidden h-4 w-4 text-muted sm:block" />
                </>
              }
            >
              {(close) => (
                <>
                  <p className="m-0 px-[10px] pt-2 pb-[6px] text-small text-muted">{user.email}</p>
                  <ul className="m-0 list-none p-0">
                    <li>
                      <Link href="/employer" onClick={close} className={menuLink}>
                        <Icon name="home" />
                        <span>My dashboard</span>
                      </Link>
                    </li>
                    <li>
                      <a href="/account" onClick={close} className={menuLink}>
                        <Icon name="user" />
                        <span>My account</span>
                      </a>
                    </li>
                    {user.homePath !== "/employer" ? (
                      <li>
                        <a href={user.homePath} onClick={close} className={menuLink}>
                          <Icon name="grid" />
                          <span>
                            {user.homePath === "/workspace" ? "Staff workspace" : "Job seeker dashboard"}
                          </span>
                        </a>
                      </li>
                    ) : null}
                    <li>
                      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load: the public site has its own frame */}
                      <a href="/" onClick={close} className={menuLink}>
                        <Icon name="external" />
                        <span>View public site</span>
                      </a>
                    </li>
                  </ul>
                  <div className="mt-[6px] border-t border-line px-[2px] pt-[6px]">
                    <SignOutButton />
                  </div>
                </>
              )}
            </Menu>
          </div>
        </header>
        <main
          id="employer-main"
          tabIndex={-1}
          className="mx-auto max-w-[1480px] px-4 pt-5 pb-12 sm:px-6 sm:pt-6 min-[1100px]:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
