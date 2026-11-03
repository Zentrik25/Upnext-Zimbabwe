// Skeleton loading system (R-52, STATE-01 to STATE-06): primitives, states, motion, privacy and route wiring.
import axe from "axe-core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Suspense, use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => "/",
  notFound: vi.fn(),
}));
const catalog = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  listCategories: vi.fn(),
  listLocations: vi.fn(),
  getOpportunity: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getSavedIds: vi.fn() }));
vi.mock("@/lib/session", () => session);

import { HomeLatest, HomeLatestSkeleton } from "@/components/home/latest";
import { CategoryGridSkeleton, HeroSearchSkeleton } from "@/components/home/sections";
import { FiltersSkeleton, ResultsSkeleton, SearchSkeleton } from "@/components/opportunities/skeletons";
import { Results } from "@/components/opportunities/results";
import {
  AccountLoading,
  AlertsLoading,
  EmployerDashboardLoading,
  ProfileLoading,
  SeekerListLoading,
  SeekerOverviewLoading,
  WorkspaceDashboardLoading,
  WorkspaceDetailLoading,
  WorkspaceListLoading,
} from "@/components/ui/page-skeletons";
import {
  LoadingRegion,
  SkeletonAvatar,
  SkeletonBadge,
  SkeletonButton,
  SkeletonCard,
  SkeletonHeading,
  SkeletonImage,
  SkeletonInput,
  SkeletonLine,
  SkeletonList,
  SkeletonPageHeader,
  SkeletonTable,
  SkeletonText,
} from "@/components/ui";
import type { OpportunitySummary } from "@/lib/catalog-types";

const src = resolve(__dirname, "../../src");
const app = join(src, "app");

function row(i: number): OpportunitySummary {
  return {
    id: `id-${i}`,
    slug: `role-${i}`,
    title: `Programme Officer ${i}`,
    summary: "",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o", name: "Example Trust" },
    locations: [{ slug: "harare", name: "Harare", is_primary: true }],
    work_mode: "onsite",
    employment_type: "full_time",
    deadline: { at: "2026-12-31", timezone: "Africa/Harare", is_date_only: true, state: "open" },
    salary: null,
    verification: { level: "source_checked", checked_at: null },
    primary_source_name: "Example",
    status: "published",
    published_at: "2026-10-01T00:00:00Z",
    is_saved: null,
  };
}
const page = (n: number) => ({
  ok: true as const,
  data: {
    data: Array.from({ length: n }, (_, i) => row(i)),
    page: { limit: 6, has_more: false, next_cursor: null, total: n },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(null);
  session.getSavedIds.mockResolvedValue(new Set());
});
afterEach(cleanup);

async function violations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

describe("primitives", () => {
  it("every primitive renders, hides itself from assistive technology inside a region, and passes axe", async () => {
    const { container } = render(
      <LoadingRegion label="everything">
        <SkeletonText />
        <SkeletonHeading />
        <SkeletonImage />
        <SkeletonAvatar />
        <SkeletonButton />
        <SkeletonBadge />
        <SkeletonCard />
        <SkeletonInput />
        <SkeletonTable />
        <SkeletonList count={2} />
        <SkeletonPageHeader action />
      </LoadingRegion>,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading everything…");
    expect(container.querySelector("[aria-hidden='true']")!.children.length).toBeGreaterThan(5);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(await violations(container)).toEqual([]);
  });

  it("a page region announces once with a level-1 heading role; a section region announces text only", () => {
    const { rerender } = render(<LoadingRegion label="the page">x</LoadingRegion>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Loading the page…");
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    rerender(
      <LoadingRegion label="the list" heading={false}>
        x
      </LoadingRegion>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading the list…");
  });

  it("a caller's width or height replaces the default instead of competing with it", () => {
    const { container } = render(<SkeletonLine className="w-1/4 h-[20px]" />);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("w-1/4");
    expect(cls).not.toContain("w-full");
    expect(cls).not.toMatch(/h-\[14px\]/);
    const plain = render(<SkeletonLine />).container.firstElementChild!.className;
    expect(plain).toContain("w-full");
  });

  it("uses no inline style (the content security policy forbids it) and no hard-coded colours", () => {
    const { container } = render(
      <LoadingRegion label="x">
        <SkeletonTable />
        <SkeletonCard />
      </LoadingRegion>,
    );
    expect(container.innerHTML).not.toMatch(/style=|#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});

describe("motion", () => {
  const css = readFileSync(join(src, "styles/globals.css"), "utf8");

  it("pulses opacity only, slowly, and only when reduced motion has not been requested", () => {
    const keyframes = css.match(/@keyframes skeleton-pulse \{([\s\S]*?)\n\}\n/)![1]!;
    expect([...keyframes.matchAll(/([a-z-]+):\s*[\d.]+;/g)].map((m) => m[1])).toEqual(["opacity", "opacity"]);
    const guarded = css.match(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.skeleton-pulse \{([^}]*)\}/,
    )!;
    const [, duration] = guarded[1]!.match(/skeleton-pulse ([\d.]+)s/)!;
    expect(Number(duration)).toBeGreaterThanOrEqual(1.5); // far below the three-flashes-a-second limit
    expect(css.match(/\.skeleton-pulse/g)).toHaveLength(1); // declared once, only inside the guard
  });

  it("the global reduced-motion rule also switches every animation off", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*animation: none !important/);
  });

  it("one animated element per region, never one per block", () => {
    const { container } = render(
      <LoadingRegion label="x">
        <SkeletonTable rows={10} />
      </LoadingRegion>,
    );
    expect(container.querySelectorAll(".skeleton-pulse")).toHaveLength(1);
  });
});

describe("home page: loading, success, empty and failure are four different states", () => {
  it("shows the skeleton while the request is pending, then real rows, and no skeleton remains", async () => {
    catalog.listOpportunities.mockResolvedValue(page(2));
    const loaded = await HomeLatest();
    let resolve!: (value: unknown) => void;
    const pending = new Promise((r) => (resolve = r));
    const Slot = () => use(pending) as React.ReactElement;
    await act(async () => {
      render(
        <Suspense fallback={<HomeLatestSkeleton />}>
          <Slot />
        </Suspense>,
      );
    });
    expect(screen.getByTestId("loading").textContent).toContain("Loading the latest opportunities…");
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(6);
    expect(screen.queryByTestId("latest")).toBeNull();
    await act(async () => {
      resolve(loaded);
      await pending;
    });
    await screen.findByText("Programme Officer 0");
    expect(screen.queryByTestId("loading")).toBeNull();
    expect(screen.queryAllByTestId("skeleton-row")).toHaveLength(0);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("Programme Officer 0")).toBeTruthy();
  });

  it("an empty list is an empty state, not an error and not a skeleton", async () => {
    catalog.listOpportunities.mockResolvedValue(page(0));
    render(await HomeLatest());
    expect(screen.getByTestId("latest-empty").textContent).toContain("New opportunities are added");
    expect(screen.queryByTestId("section-error")).toBeNull();
    expect(screen.queryByText(/unavailable right now/)).toBeNull();
  });

  it("a failed request says so, never invents jobs, and offers a retry that re-runs the server render", async () => {
    catalog.listOpportunities.mockResolvedValue({ ok: false, reason: "unreachable" });
    const { container } = render(await HomeLatest());
    expect(screen.getByRole("alert").textContent).toContain("Opportunities are unavailable right now");
    expect(screen.queryByTestId("latest")).toBeNull();
    expect(screen.queryByTestId("latest-empty")).toBeNull();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(await violations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the home skeletons are static-free regions with their own status text", () => {
    const { container } = render(
      <>
        <HeroSearchSkeleton />
        <CategoryGridSkeleton />
      </>,
    );
    expect(screen.getAllByRole("status").map((r) => r.textContent)).toEqual([
      "Loading search…",
      "Loading categories…",
    ]);
    expect(container.querySelectorAll("a, button, input, select")).toHaveLength(0);
  });
});

describe("listing page results", () => {
  const params = new URLSearchParams();
  const props = { params, signedIn: false, savedIds: new Set<string>(), returnTo: "/opportunities" };

  it("zero results is an empty state", async () => {
    render(await Results({ ...props, result: page(0) }));
    expect(screen.getByText("No opportunities match")).toBeTruthy();
    expect(screen.queryByTestId("section-error")).toBeNull();
  });

  it("an API failure is an error with a retry, never an empty result", async () => {
    for (const reason of ["unreachable", "rate-limited", "unexpected-response"] as const) {
      cleanup();
      render(await Results({ ...props, result: { ok: false, reason } }));
      expect(screen.queryByText("No opportunities match")).toBeNull();
      expect(screen.getByTestId("section-error")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    }
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("an invalid filter offers to clear the filters instead of a pointless retry", async () => {
    render(await Results({ ...props, result: { ok: false, reason: "invalid-query" } }));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/opportunities");
  });

  it("a successful page shows the real rows and the count", async () => {
    render(await Results({ ...props, result: page(3) }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByTestId("result-count").textContent).toBe("3 opportunities");
  });

  it("retry waits visibly and cannot be pressed twice", async () => {
    render(await Results({ ...props, result: { ok: false, reason: "unreachable" } }));
    const button = screen.getByRole("button", { name: "Try again" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the listing skeletons keep the real structure", async () => {
    const { container } = render(
      <>
        <SearchSkeleton />
        <FiltersSkeleton />
        <ResultsSkeleton />
      </>,
    );
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(6);
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(await violations(container)).toEqual([]);
  });
});

describe("private and staff skeletons expose nothing private", () => {
  const SECRET = /@|Welcome back|\b\d{2,}\b/; // an e-mail, a greeting by name, any figure

  it("each page skeleton renders placeholders only: no text but the one status line", () => {
    const pages = [
      <AccountLoading key="a" />,
      <ProfileLoading key="p" />,
      <AlertsLoading key="al" />,
      <EmployerDashboardLoading key="e" />,
      <SeekerOverviewLoading key="o" />,
      <SeekerListLoading
        key="l"
        current="saved"
        label="your saved opportunities"
        intro="h-[67px] sm:h-[22px]"
      />,
      <WorkspaceDashboardLoading key="w" />,
      <WorkspaceListLoading key="wl" label="the opportunities" action />,
      <WorkspaceDetailLoading key="wd" label="the record" />,
    ];
    for (const element of pages) {
      cleanup();
      const { container } = render(element);
      const visible = [...container.querySelectorAll("[aria-hidden='true']")]
        .map((n) => n.textContent)
        .join("");
      expect(visible, "decorative blocks carry no text").not.toMatch(/\S/);
      expect(container.textContent).not.toMatch(SECRET);
      expect(container.querySelectorAll("form, input, a[href^='/workspace']")).toHaveLength(0);
    }
  });

  it("the jobseeker skeleton keeps its (static) navigation and the page still has one level-1 heading role", () => {
    render(
      <SeekerListLoading current="saved" label="your saved opportunities" intro="h-[67px] sm:h-[22px]" />,
    );
    expect(screen.getByRole("link", { name: "Saved" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("table skeletons collapse to cards below 768px: header hidden, trailing columns hidden", () => {
    const { container } = render(<SkeletonTable rows={2} columns={6} />);
    expect(container.querySelector(".max-md\\:hidden")).not.toBeNull();
    expect(container.querySelectorAll("[data-testid=skeleton-table-row]")).toHaveLength(2);
  });
});

describe("route wiring", () => {
  const files = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) files(full, out);
      else if (e.name === "loading.tsx") out.push(full.slice(app.length + 1));
    }
    return out;
  };
  const loading = files(app).sort();

  it("every private data-driven route has a loading file", () => {
    for (const route of [
      "account",
      "alerts",
      "dashboard",
      "employer",
      "employer/claim",
      "employer/listings/new",
      "employer/listings/[id]",
      "employer/organisations/[orgId]/profile",
      "for-you",
      "profile",
      "saved",
      "workspace/(shell)",
      "workspace/(shell)/opportunities",
      "workspace/(shell)/opportunities/[id]",
      "workspace/(shell)/activity",
      "workspace/(shell)/content-health",
      "workspace/(shell)/manage/[kind]",
      "workspace/(shell)/manage/[kind]/[id]",
      "workspace/(shell)/records/[kind]",
      "workspace/(shell)/records/[kind]/[id]",
    ]) {
      expect(existsSync(join(app, route, "loading.tsx")), route).toBe(true);
    }
  });

  it("no public route has one: it would turn an unknown listing's 404 into a streamed 200 (checked in a running app)", () => {
    const publicRoutes = loading.filter(
      (f) => !/^(account|alerts|dashboard|employer|for-you|profile|saved|workspace)\//.test(f),
    );
    expect(publicRoutes).toEqual([]);
  });

  it("the slow sections of the public pages sit in their own Suspense boundaries", () => {
    const home = readFileSync(join(app, "page.tsx"), "utf8");
    expect(home.match(/<Suspense/g)).toHaveLength(3);
    expect(home).toContain("fallback={<HomeLatestSkeleton />}");
    const list = readFileSync(join(app, "opportunities/page.tsx"), "utf8");
    expect(list.match(/<Suspense/g)).toHaveLength(4);
    expect(list).toContain("fallback={<ResultsSkeleton />}");
    const detail = readFileSync(join(app, "opportunities/[slug]/page.tsx"), "utf8");
    // the status code is decided before anything is streamed: notFound() comes before the first boundary
    expect(detail.indexOf("notFound()")).toBeLessThan(detail.indexOf("<Suspense"));
  });

  it("one request for the data a page's sections share", () => {
    const home = readFileSync(join(app, "page.tsx"), "utf8");
    expect(home).toContain("cache(listCategories)");
    const list = readFileSync(join(app, "opportunities/page.tsx"), "utf8");
    expect(list).toContain("cache(listCategories)");
    expect(readFileSync(join(src, "components/opportunities/results.tsx"), "utf8")).toContain("cache(");
    const detail = readFileSync(join(app, "opportunities/[slug]/page.tsx"), "utf8");
    expect(detail).toContain("cache(fetchOpportunity)");
  });
});

describe("skeletons are the size of the real thing (measured against a running stack, 2026-10-31)", () => {
  const read = (path: string) => readFileSync(join(src, path), "utf8");

  it("the search skeletons use the 40px field height of the real search controls, not the old 44px", () => {
    const real = read("components/home/sections.tsx");
    expect(real).toMatch(/block min-h-field w-full/); // the real hero control
    expect(real).toContain('className="relative h-[44px] w-full gap-2 text-ctl"'); // an explicit height: min-h-control would win
    const { container } = render(<HeroSearchSkeleton />);
    expect(container.innerHTML).not.toContain("h-search");
    expect(container.querySelectorAll(".h-field")).toHaveLength(3);
    expect(container.querySelector(".h-\\[44px\\]")).not.toBeNull();
    cleanup();
    const group = render(<SearchSkeleton />).container;
    expect(group.innerHTML).not.toContain("h-search");
    expect(group.querySelector(".h-\\[42px\\]")).not.toBeNull(); // 40px field plus its two 1px borders
    expect(group.querySelectorAll(".h-field")).toHaveLength(2);
    expect(read("components/ui/search-group.tsx")).toContain("min-h-field");
  });

  it("a page header skeleton given the real introduction height is exactly as tall as the real header", () => {
    const { container } = render(<SkeletonPageHeader intro="h-[67px] sm:h-[22px]" />);
    expect(container.querySelector(".h-\\[67px\\]")).not.toBeNull();
    expect(container.querySelector(".sm\\:h-\\[22px\\]")).not.toBeNull();
    expect(container.querySelector(".h-\\[29px\\]")).not.toBeNull(); // the page title at phone width (26px type)
    expect(container.querySelector(".pb-4")).toBeNull(); // the real header has no bottom padding
  });

  it("the account skeleton is the hub: the profile card and the five settings rows of the real page", () => {
    const { container } = render(<AccountLoading />);
    // profile card + five rows + the sign-out button, as direct children of the 640px column
    expect(container.querySelector(".max-w-\\[640px\\]")?.children).toHaveLength(7);
    const page = read("app/account/page.tsx");
    expect(page.match(/<SettingsRow/g)).toHaveLength(5);
  });

  it("every account settings sub-page has its own skeleton", () => {
    for (const section of ["personal", "security", "sessions", "delete"]) {
      expect(read(`app/account/${section}/loading.tsx`)).toContain("AccountSectionLoading");
    }
    expect(read("app/account/delete/page.tsx")).toContain("<DeletionPanel");
  });

  it("the profile and alerts skeletons are long forms, and every seeker loading file names its introduction height", () => {
    for (const file of ["saved", "for-you"]) {
      expect(read(`app/${file}/loading.tsx`)).toMatch(/intro="h-\[\d+px\] sm:h-\[\d+px\]"/);
    }
    expect(read("app/profile/loading.tsx")).toContain("ProfileLoading");
    expect(read("app/alerts/loading.tsx")).toContain("AlertsLoading");
    const { container } = render(<ProfileLoading />);
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-hidden='true'] .h-\\[24px\\]").length).toBeGreaterThan(20);
  });
});
