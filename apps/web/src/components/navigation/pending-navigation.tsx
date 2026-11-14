"use client";

import { useLinkStatus } from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
/**
 * Skeletons for client-side transitions only (owner decision O-12, 2026-11-14, D-75).
 *
 * The public discovery pages send their complete content in the first HTML (no Suspense fallback), so a visitor
 * without JavaScript and a crawler always get the listings. When a visitor who already has the page open follows a
 * site link to one of those pages, the old page would otherwise stay on screen until the new one arrives; instead the
 * main region shows the destination's skeleton while that navigation is pending. `PendingSignal` sits inside a
 * `next/link` and reports its pending state; `PendingMain` swaps the region. On the server nothing is ever pending,
 * so the first HTML is never a skeleton. Authenticated pages keep their own route-level loading files (R-52).
 */

type Pending = { href: string | null; set: (update: (current: string | null) => string | null) => void };
const PendingContext = createContext<Pending>({ href: null, set: () => {} });

export function PendingNavigationProvider({ children }: { children: ReactNode }) {
  const [href, setHref] = useState<string | null>(null);
  return <PendingContext.Provider value={{ href, set: setHref }}>{children}</PendingContext.Provider>;
}

/** Place inside a `next/link`; it renders nothing and reports when that link's navigation is pending. */
export function PendingSignal({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  const { set } = useContext(PendingContext);
  useEffect(() => {
    if (pending) set(() => href);
    else set((current) => (current === href ? null : current));
    // A link that unmounts mid-navigation must not leave the skeleton behind.
    return () => set((current) => (current === href && pending ? null : current));
  }, [pending, href, set]);
  return null;
}

/** The destination's path without its query, for choosing a skeleton. */
function pathOf(href: string): string {
  try {
    return new URL(href, "https://upnext.invalid").pathname;
  } catch {
    return href;
  }
}

/** Which discovery page a pending link leads to, if any: only these get a transition skeleton. */
export function discoveryDestination(href: string | null): "home" | "opportunities" | "directory" | null {
  if (!href) return null;
  const path = pathOf(href);
  if (path === "/") return "home";
  if (path === "/opportunities" || path === "/jobs" || path.startsWith("/jobs/")) return "opportunities";
  if (path === "/categories" || path === "/locations" || path === "/guides") return "directory";
  return null;
}

/*
 * Deliberately small (plain elements, no imports): this module ships with every public page, which have script budgets
 * (tests/e2e/mobile-budget.spec.ts). The shapes follow the real pages; the status is announced once.
 */
const bar = "rounded-control bg-line";
const wrap = "mx-auto w-full max-w-[1160px] px-4 py-8";

function Status({ label }: { label: string }) {
  return (
    <div role="heading" aria-level={1} className="sr-only">
      Loading {label}…
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2 border-b border-line pb-4">
          <div className={`h-5 w-2/3 ${bar}`} />
          <div className={`h-4 w-1/3 ${bar}`} />
        </div>
      ))}
    </div>
  );
}

function Transition({ label, kind }: { label: string; kind: "opportunities" | "home" | "directory" }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid="loading" className={wrap}>
      <Status label={label} />
      <div aria-hidden="true" className="skeleton-pulse grid gap-5">
        <div className={`h-9 w-1/2 max-sm:w-full ${bar}`} />
        {kind === "opportunities" ? (
          <div className="h-[44px] w-full max-w-[790px] rounded-control border border-line" />
        ) : null}
        <div
          className={kind === "opportunities" ? "grid grid-cols-[230px_1fr] gap-6 max-md:grid-cols-1" : ""}
        >
          {kind === "opportunities" ? <div className={`h-64 max-md:hidden ${bar}`} /> : null}
          <Rows count={kind === "home" ? 4 : 6} />
        </div>
      </div>
    </div>
  );
}

/** The page, or the destination's skeleton while a site link to a discovery page is pending. */
export function PendingMain({ children }: { children: ReactNode }) {
  const { href } = useContext(PendingContext);
  const destination = discoveryDestination(href);
  if (destination === "opportunities") return <Transition label="opportunities" kind="opportunities" />;
  if (destination === "home") return <Transition label="the home page" kind="home" />;
  if (destination === "directory") return <Transition label="the page" kind="directory" />;
  return <>{children}</>;
}
