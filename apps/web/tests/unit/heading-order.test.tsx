// Regression for A-01 (M1): the failure state of a page must not skip a heading level.
// CI run 39176711994 failed the jobseeker journey with `axe /profile at 320: heading-order: h3`: when the
// profile service call failed, /profile rendered an <h3> straight under the page <h1>.
import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getProfile: vi.fn(),
  getJobAlert: vi.fn(),
  getSavedIds: vi.fn(),
  getOpportunity: vi.fn(),
  listCategories: vi.fn(),
  listLocations: vi.fn(),
  listSectors: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: m.getCurrentUser,
  getProfile: m.getProfile,
  getJobAlert: m.getJobAlert,
  getSavedIds: m.getSavedIds,
}));
vi.mock("@/lib/catalog", () => ({
  getOpportunity: m.getOpportunity,
  listCategories: m.listCategories,
  listLocations: m.listLocations,
  listSectors: m.listSectors,
}));

import AlertsPage from "@/app/alerts/page";
import OpportunityPage from "@/app/opportunities/[slug]/page";
import ProfilePage from "@/app/profile/page";
import { EmptyState } from "@/components/ui";

const USER = { id: "u1", display_name: "Test User", email: "t@example.org", email_verified: true };

/** Heading levels in document order. */
function levels(container: HTMLElement): number[] {
  return [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName.slice(1)));
}

/** WCAG 1.3.1 as axe's heading-order rule applies it: a heading may be at most one level deeper than the last. */
function skipsALevel(sequence: number[]): boolean {
  return sequence.some((level, i) => (i === 0 ? false : level > sequence[i - 1]! + 1));
}

async function headingOrderViolations(container: HTMLElement) {
  const results = await axe.run(container, { runOnly: { type: "rule", values: ["heading-order"] } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

beforeEach(() => {
  m.getCurrentUser.mockResolvedValue(USER);
  m.listCategories.mockResolvedValue([]);
  m.listLocations.mockResolvedValue([]);
  m.listSectors.mockResolvedValue([]);
  m.getSavedIds.mockResolvedValue(new Set<string>());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("failure states keep a valid heading order (A-01)", () => {
  const cases: { name: string; arrange: () => void; page: () => Promise<ReactElement> }[] = [
    {
      name: "/profile when the profile service is unavailable",
      arrange: () => m.getProfile.mockResolvedValue(null),
      page: () => ProfilePage(),
    },
    {
      name: "/alerts when the alert settings are unavailable",
      arrange: () => m.getJobAlert.mockResolvedValue(null),
      page: () => AlertsPage(),
    },
  ];

  for (const { name, arrange, page } of cases) {
    it(`${name}: one h1, then h2, never an h3 under the h1`, async () => {
      arrange();
      const { container } = render(await page());
      const sequence = levels(container);
      expect(sequence.filter((l) => l === 1)).toHaveLength(1);
      expect(sequence).toEqual([1, 2]);
      expect(skipsALevel(sequence)).toBe(false);
      expect(await headingOrderViolations(container)).toEqual([]);
    });
  }

  it("the listing page's unavailable state is the page's h1 (it has no other heading)", async () => {
    m.getOpportunity.mockResolvedValue({ ok: false, reason: "unreachable" });
    const { container } = render(await OpportunityPage({ params: Promise.resolve({ slug: "any" }) }));
    expect(levels(container)).toEqual([1]);
    expect(await headingOrderViolations(container)).toEqual([]);
  });
});

describe("EmptyState heading level", () => {
  it("defaults to h3 for use inside a section that already has an h2", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(levels(container)).toEqual([3]);
  });

  it.each([
    ["h1", 1],
    ["h2", 2],
  ] as const)("renders %s when asked", (as, level) => {
    const { container } = render(<EmptyState as={as} title="Nothing here" />);
    expect(levels(container)).toEqual([level]);
  });

  it("the detector really catches the original defect (h1 followed by h3)", async () => {
    const { container } = render(
      <main>
        <h1>Your profile</h1>
        <EmptyState title="Your profile is unavailable" />
      </main>,
    );
    expect(skipsALevel(levels(container))).toBe(true);
    expect((await headingOrderViolations(container)).join()).toContain("heading-order");
  });
});
