"use client";

import { useLinkStatus } from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { FiltersSkeleton, ResultsSkeleton, SearchSkeleton } from "@/components/opportunities/skeletons";
import {
  LoadingRegion,
  SkeletonHeading,
  SkeletonLine,
  SkeletonListingRows,
  SkeletonTabs,
} from "@/components/ui/skeleton";

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

function OpportunitiesTransition() {
  return (
    <>
      <section className="border-b border-line py-[22px]">
        <Container>
          <LoadingRegion label="opportunities" className="grid gap-3">
            <SkeletonHeading size="page" className="w-1/2 max-sm:w-full" />
          </LoadingRegion>
          <div className="mt-3">
            <SearchSkeleton />
          </div>
        </Container>
      </section>
      <Container>
        <SkeletonTabs />
      </Container>
      <Container className="grid grid-cols-[230px_1fr] gap-6 pt-[18px] pb-[65px] max-md:grid-cols-1">
        <div className="max-md:hidden">
          <FiltersSkeleton />
        </div>
        <ResultsSkeleton />
      </Container>
    </>
  );
}

function HomeTransition() {
  return (
    <Container className="py-10 max-sm:py-6">
      <LoadingRegion label="the home page" className="grid gap-4">
        <SkeletonHeading size="page" className="w-2/3" />
        <SkeletonLine className="w-1/2" />
        <SkeletonListingRows count={4} />
      </LoadingRegion>
    </Container>
  );
}

function DirectoryTransition() {
  return (
    <Container className="py-10 max-sm:py-6">
      <LoadingRegion label="the page" className="grid gap-4">
        <SkeletonHeading size="page" className="w-1/2" />
        <SkeletonLine className="w-2/3" />
        <SkeletonListingRows count={4} />
      </LoadingRegion>
    </Container>
  );
}

/** The page, or the destination's skeleton while a site link to a discovery page is pending. */
export function PendingMain({ children }: { children: ReactNode }) {
  const { href } = useContext(PendingContext);
  const destination = discoveryDestination(href);
  if (destination === "opportunities") return <OpportunitiesTransition />;
  if (destination === "home") return <HomeTransition />;
  if (destination === "directory") return <DirectoryTransition />;
  return <>{children}</>;
}
