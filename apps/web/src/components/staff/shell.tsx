"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Monogram, NavLogo } from "@/components/brand/logo";
import { applyTheme, useThemeChoice } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/client-api";

export type NavEntry = { href: string; label: string; badge?: number | null; view?: string };
export type NavGroup = { title: string; items: NavEntry[] };

function isActive(entry: NavEntry, pathname: string, view: string | null): boolean {
  const [path] = entry.href.split("?");
  if (entry.view !== undefined) return pathname === path && (view ?? "all") === entry.view;
  if (path === "/staff") return pathname === "/staff";
  if (path === "/staff/opportunities") return pathname === path && (view === null || view === "all");
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  return (
    <nav aria-label="Staff" className="grid gap-5">
      {groups.map((group) => (
        <div key={group.title}>
          {group.title ? (
            <p className="mb-1 px-3 text-micro uppercase tracking-eyebrow text-brand-dark-text/80">
              {group.title}
            </p>
          ) : null}
          <ul className="grid gap-0.5">
            {group.items.map((entry) => {
              const active = isActive(entry, pathname, view);
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[40px] items-center justify-between gap-2 rounded-control border-l-2 px-3 text-ctl",
                      active
                        ? "border-white bg-white/10 text-white"
                        : "border-transparent text-brand-dark-text hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <span>{entry.label}</span>
                    {entry.badge ? (
                      <span className="tnum rounded-micro bg-white px-1.5 text-small text-brand-dark">
                        <span className="sr-only">{entry.badge} waiting: </span>
                        <span aria-hidden="true">{entry.badge}</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function CreateLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/staff/opportunities/new"
      onClick={onNavigate}
      className="inline-flex min-h-control w-full items-center justify-center rounded-control border border-white bg-white px-4 text-ctl font-medium text-brand-dark hover:bg-line"
    >
      Create Opportunity
    </Link>
  );
}

function ThemeSwitch() {
  const choice = useThemeChoice();
  return (
    <div role="group" aria-label="Colour theme" className="flex items-center gap-1">
      {(["light", "dark"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          onClick={() => applyTheme(value)}
          className={cn(
            "inline-flex min-h-control min-w-[44px] items-center justify-center rounded-control border px-3 text-small",
            choice === value
              ? "border-border-strong bg-match-bg text-secondary-text"
              : "border-transparent text-muted hover:text-ink",
          )}
        >
          {value === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

function UserMenu({ name, role }: { name: string; role: string }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await apiFetch("POST", "auth/logout");
    // A full page load on purpose: it drops every piece of signed-in client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/staff/sign-in");
  }
  return (
    <div className="flex items-center gap-3">
      <div className="text-right max-sm:hidden">
        <p className="text-ctl leading-tight text-ink">{name}</p>
        <p className="text-small leading-tight text-muted">{role}</p>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="inline-flex min-h-control items-center rounded-control border border-border-strong px-3 text-ctl text-secondary-text hover:bg-accent/5 disabled:opacity-60"
      >
        Sign out
      </button>
    </div>
  );
}

export function StaffShell({
  groups,
  user,
  children,
}: {
  groups: NavGroup[];
  user: { name: string; role: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  // The drawer belongs to the page it was opened on: any navigation (links, back button) closes it.
  const [drawer, setDrawer] = useState<string | null>(null);
  const open = drawer === pathname;
  const setOpen = (value: boolean) => setDrawer(value ? pathname : null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Escape closes the drawer; Tab stays inside it while it is open.
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(null);
        toggleRef.current?.focus();
      }
      if (event.key === "Tab" && drawer) {
        const focusable = [...drawer.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pathname]);

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <Link href="/staff" onClick={onNavigate} className="inline-flex min-h-[44px] items-center text-white">
        <NavLogo className="h-[26px] w-auto" />
        <span className="sr-only">UPNEXT Careers</span>
        <span className="ml-3 rounded-micro border border-brand-dark-text/50 px-1.5 text-micro uppercase tracking-eyebrow text-brand-dark-text">
          Staff
        </span>
      </Link>
      <CreateLink onNavigate={onNavigate} />
      <NavList groups={groups} onNavigate={onNavigate} />
      {/* A plain link on purpose: the public site has a different shell, so it needs a full page load. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-auto inline-flex min-h-[40px] items-center px-3 text-ctl text-brand-dark-text underline"
      >
        View public site
      </a>
    </div>
  );

  return (
    <div className="min-h-screen bg-(--staff-canvas) text-ink md:grid md:grid-cols-[256px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-ctl"
      >
        Skip to main content
      </a>
      <aside className="sticky top-0 hidden h-screen bg-brand-dark md:block" aria-label="Sidebar">
        {sidebar()}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
          <div className="flex min-h-[60px] items-center gap-3 px-4 md:px-8">
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={open}
              aria-controls="staff-drawer"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control border border-border-strong text-ctl text-secondary-text md:hidden"
            >
              <span className="sr-only">Open menu</span>
              <span aria-hidden="true">Menu</span>
            </button>
            <Link
              href="/staff"
              className="inline-flex items-center text-logo md:hidden"
              aria-label="Staff dashboard"
            >
              <Monogram className="h-6 w-auto" />
            </Link>
            <form
              action="/staff/opportunities"
              method="get"
              role="search"
              className="ml-auto flex max-w-[360px] flex-1 items-center"
            >
              <label htmlFor="staff-search" className="sr-only">
                Search opportunities
              </label>
              <input
                id="staff-search"
                name="q"
                type="search"
                placeholder="Search opportunities"
                maxLength={100}
                className="min-h-control w-full rounded-control border border-control-border bg-surface px-3 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus"
              />
            </form>
            <ThemeSwitch />
            <UserMenu name={user.name} role={user.role} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              toggleRef.current?.focus();
            }}
            className="absolute inset-0 bg-overlay"
          />
          <div
            id="staff-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Staff menu"
            className="absolute inset-y-0 left-0 w-[min(320px,88vw)] bg-brand-dark shadow-deep"
          >
            <div className="flex justify-end px-4 pt-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toggleRef.current?.focus();
                }}
                className="inline-flex min-h-[44px] items-center rounded-control border border-brand-dark-text px-3 text-ctl text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
            {sidebar(() => setOpen(false))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
