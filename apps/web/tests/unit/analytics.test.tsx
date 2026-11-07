import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ListingEvents } from "@/components/opportunities/listing-events";
import { AnalyticsPanel, AnalyticsSkeleton } from "@/components/workspace/analytics/analytics-panel";
import { AnalyticsView } from "@/components/workspace/analytics/analytics-view";
import { TrafficChart } from "@/components/workspace/analytics/traffic-chart";
import { ListingTable } from "@/components/workspace/listing-table";
import { AnalyticsLoading } from "@/components/ui/page-skeletons";
import { bucketLabel, count, percent } from "@/lib/staff-format";
import type { AnalyticsOverview, AnalyticsRow, ListingRow } from "@/lib/staff-types";
import { repoRoot, readRepoFile } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const row = (over: Partial<AnalyticsRow> = {}): AnalyticsRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "driver-salesperson-k7m3qp",
  title: "Driver Salesperson",
  organisation: "Delta Beverages",
  published_at: "2026-10-30T08:00:00Z",
  status: "published",
  views: 120,
  all_time_views: 480,
  apply_clicks: 12,
  click_through_rate: 0.1,
  ...over,
});

const overview = (over: Partial<AnalyticsOverview> = {}): AnalyticsOverview => ({
  period: "30d",
  generated_at: "2026-11-02T10:30:00Z",
  traffic: {
    all_time: { views: 1520, apply_clicks: 90 },
    last_24_hours: { views: 31, apply_clicks: 2 },
    last_7_days: { views: 240, apply_clicks: 15 },
    last_30_days: { views: 900, apply_clicks: 60 },
  },
  tracking: { hourly_since: "2026-10-20T08:00:00Z", daily_since: "2026-09-01" },
  operations: { published: 14, active: 12, expired: 3, draft: 2, awaiting_verification: 9 },
  saves: 7,
  chart: {
    bucket: "day",
    points: [
      { t: "2026-10-31T22:00:00Z", views: 4, apply_clicks: 0 },
      { t: "2026-11-01T22:00:00Z", views: 10, apply_clicks: 1 },
      { t: "2026-11-02T22:00:00Z", views: 0, apply_clicks: 0 },
    ],
    views: 14,
    apply_clicks: 1,
  },
  most_viewed: [row()],
  recently_viewed: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Stock Controllers",
      organisation: "Delta Beverages",
      last_viewed_hour: "2026-11-02T09:00:00Z",
    },
  ],
  scope: "platform",
  unique_visitors: null,
  ...over,
});

type Call = { url: string };
function stubApi(handler: (call: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/auth/csrf"))
        return new Response(JSON.stringify({ csrf_token: "t" }), { status: 200 });
      calls.push({ url });
      const out = handler({ url });
      return new Response(JSON.stringify(out.json), { status: out.status ?? 200 });
    }),
  );
  return calls;
}
const table = (data: AnalyticsRow[], page = { page: 1, page_size: 15, total: data.length, pages: 1 }) => ({
  data,
  page,
  window: "30d",
  tracking: { hourly_since: null, daily_since: null },
});

describe("formatting", () => {
  it("shows day and hour buckets in Harare time, months as plain dates, and never invents a figure", () => {
    expect(bucketLabel("2026-11-01T22:00:00Z", "day")).toBe("2 Nov"); // 22:00 UTC is already 2 Nov in Harare
    expect(bucketLabel("2026-11-02T09:00:00Z", "hour")).toMatch(/2 Nov.*11:00/);
    expect(bucketLabel("2026-09-01", "month")).toBe("Sept 2026");
    expect(bucketLabel("2026-10-25T22:00:00Z", "week")).toBe("Week of 26 Oct");
    expect(count(12480)).toBe("12,480");
    expect(count(null)).toBe("-");
    expect(percent(0.2)).toBe("20%");
    expect(percent(0.0833)).toBe("8.3%");
    expect(percent(null)).toBe("-");
  });
});

describe("traffic chart", () => {
  const points = (views: number[]) =>
    views.map((v, i) => ({ t: `2026-11-0${i + 1}T00:00:00Z`, views: v, apply_clicks: 0 }));

  it("is one labelled image with its numbers in a table for assistive technology", () => {
    const { container } = render(
      <TrafficChart points={points([3, 0, 9])} bucket="day" label="Views per day" />,
    );
    expect(screen.getByRole("img", { name: /Views per day: 12 views in 3 days/ })).toBeInTheDocument();
    const t = screen.getByRole("table", { hidden: true });
    expect(within(t).getAllByRole("row", { hidden: true })).toHaveLength(4); // header and three buckets
    expect(container.querySelectorAll("title")).toHaveLength(3); // a tooltip per bucket
    expect(container.querySelector("path")).not.toBeNull();
  });

  it("draws quiet buckets as zero, handles one point and an all-zero series, and uses a tidy axis", () => {
    const { container, rerender } = render(
      <TrafficChart points={points([0, 0, 0])} bucket="day" label="Views" />,
    );
    expect(container.textContent).toContain("4"); // the axis never collapses to 0 of 0
    rerender(<TrafficChart points={points([7])} bucket="hour" label="Views" />);
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
    rerender(<TrafficChart points={points([13, 2])} bucket="week" label="Views" />);
    expect(container.textContent).toContain("16"); // quarters of 4: 0, 4, 8, 12, 16
    rerender(<TrafficChart points={points([205, 50])} bucket="day" label="Views" />);
    expect(container.textContent).toContain("240"); // quarters of 60, never 187.5
    expect(container.textContent).not.toContain(".5");
  });
});

describe("analytics panel", () => {
  it("shows the four traffic figures with their definitions, engagement, listing counts and the two lists", () => {
    render(<AnalyticsPanel data={overview()} />);
    for (const [label, value] of [
      ["All-time views", "1,520"],
      ["Last 24 hours", "31"],
      ["Last 7 days", "240"],
      ["Last 30 days", "900"],
    ] as const)
      expect(
        within(screen.getByRole("region", { name: "Traffic" })).getAllByText(label)[0]!.parentElement,
      ).toHaveTextContent(value);
    expect(screen.getAllByText("Rolling")).toHaveLength(3);
    expect(screen.getByText("Unique visitors").parentElement).toHaveTextContent("Not measured");
    expect(
      within(screen.getByRole("region", { name: "Traffic" })).getByText("Apply clicks").parentElement,
    ).toHaveTextContent("not applications");
    expect(screen.getByText("Saved by visitors").parentElement).toHaveTextContent("7");
    expect(screen.getByRole("link", { name: /Awaiting verification/ })).toHaveAttribute(
      "href",
      "/workspace/opportunities?status=published&verified=no",
    );
    expect(screen.getByText("Published").parentElement).toHaveTextContent("14");
    expect(screen.getByRole("link", { name: /Driver Salesperson/ })).toHaveAttribute(
      "href",
      "/workspace/opportunities/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByText(/Stock Controllers/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Views per day/ })).toBeInTheDocument();
  });

  it("says when counting began and that nothing earlier is estimated", () => {
    render(<AnalyticsPanel data={overview()} />);
    const note = screen.getByTestId("tracking-note");
    expect(note).toHaveTextContent("Counting began on 1 Sept 2026");
    expect(note).toHaveTextContent("Nothing before that is estimated");
    expect(note).toHaveTextContent("unique visitors are not measured");
    expect(note).toHaveTextContent("not submitted applications");
  });

  it("has an honest empty state when nothing has been recorded, with no chart and no invented numbers", () => {
    render(
      <AnalyticsPanel
        data={overview({
          traffic: {
            all_time: { views: 0, apply_clicks: 0 },
            last_24_hours: { views: 0, apply_clicks: 0 },
            last_7_days: { views: 0, apply_clicks: 0 },
            last_30_days: { views: 0, apply_clicks: 0 },
          },
          tracking: { hourly_since: null, daily_since: null },
          chart: { bucket: "day", points: [], views: 0, apply_clicks: 0 },
          most_viewed: [],
          recently_viewed: [],
        })}
      />,
    );
    expect(screen.getByTestId("tracking-note")).toHaveTextContent("No views have been recorded yet");
    expect(screen.getByText(/nothing to chart/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Views per/ })).toBeNull();
    expect(screen.getByText(/No listing has been viewed in this period/)).toBeInTheDocument();
    expect(screen.getByText(/No views recorded yet\./)).toBeInTheDocument();
  });

  it("has a skeleton that holds the figures' place and announces nothing private", () => {
    const { container } = render(<AnalyticsSkeleton />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).toBe("");
    cleanup();
    render(<AnalyticsLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("analytics view", () => {
  it("loads the figures after a skeleton, asks for the chosen period and refetches when it changes", async () => {
    const calls = stubApi((c) =>
      c.url.includes("opportunities?") ? { json: table([row()]) } : { json: overview() },
    );
    const { container } = render(<AnalyticsView title="Dashboard" description="Welcome back, Tendai." />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull(); // the skeleton while loading
    expect(await screen.findByText("1,520")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("staff/analytics?period=30d"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "24h" } });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("staff/analytics?period=24h"))).toBe(true));
    expect(screen.getByRole("link", { name: /full Analytics page/ })).toHaveAttribute(
      "href",
      "/workspace/analytics",
    );
    expect(screen.queryByText("Top-performing opportunities")).toBeNull(); // the table is on the Analytics page
  });

  it("offers all five periods", async () => {
    stubApi(() => ({ json: overview() }));
    render(<AnalyticsView title="Analytics" />);
    await screen.findByText("1,520");
    const options = within(screen.getByLabelText("Period"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Last 24 hours", "Last 7 days", "Last 30 days", "Last 90 days", "All time"]);
  });

  it("reports a failure in words and retries on request", async () => {
    let ok = false;
    const calls = stubApi(() =>
      ok
        ? { json: overview() }
        : { status: 500, json: { error: { code: "server_error", message: "Try again later." } } },
    );
    render(<AnalyticsView title="Analytics" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The analytics could not be loaded");
    ok = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1,520")).toBeInTheDocument();
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("on the Analytics page, ranks listings and explains the click-through rate", async () => {
    stubApi((c) =>
      c.url.includes("opportunities?")
        ? {
            json: table([
              row(),
              row({
                id: "33333333-3333-4333-8333-333333333333",
                title: "Stock Controllers",
                views: 0,
                click_through_rate: null,
              }),
            ]),
          }
        : { json: overview() },
    );
    render(<AnalyticsView full title="Analytics" />);
    expect(await screen.findByText("Top-performing opportunities")).toBeInTheDocument();
    const headers = (await screen.findAllByRole("columnheader")).map((h) => h.textContent);
    expect(headers.join("|")).toMatch(/Click-through rate/);
    expect(screen.getAllByText(/apply clicks ÷ views, both for the same period/).length).toBeGreaterThan(0);
    const ranked = await screen.findByRole("table", { name: /ranked by views/ });
    const rows = within(ranked).getAllByRole("row");
    expect(within(rows[1]!).getByText("10%")).toBeInTheDocument(); // 12 clicks / 120 views
    expect(within(rows[2]!).getByText("-")).toBeInTheDocument(); // no views, no rate
    expect(screen.getByText(/2 opportunities/)).toBeInTheDocument();
  });

  it("the table searches after a pause, sorts and flips direction, and pages", async () => {
    const calls = stubApi((c) =>
      c.url.includes("opportunities?")
        ? { json: table([row()], { page: 1, page_size: 15, total: 40, pages: 3 }) }
        : { json: overview() },
    );
    render(<AnalyticsView full title="Analytics" />);
    await screen.findAllByRole("row");
    const tableCalls = () => calls.filter((c) => c.url.includes("analytics/opportunities"));
    fireEvent.change(screen.getByLabelText("Search title or organisation"), { target: { value: "delta" } });
    await waitFor(() => expect(tableCalls().some((c) => c.url.includes("q=delta"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /All-time views/ }));
    await waitFor(() =>
      expect(tableCalls().some((c) => c.url.includes("sort=all_views&dir=desc"))).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: /All-time views/ }));
    await waitFor(() =>
      expect(tableCalls().some((c) => c.url.includes("sort=all_views&dir=asc"))).toBe(true),
    );
    expect(screen.getAllByRole("columnheader", { name: /All-time views/ })[0]).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(tableCalls().some((c) => c.url.includes("page=2"))).toBe(true));
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("filters the table by Harare dates, refuses an impossible range, and says what the dates mean", async () => {
    const calls = stubApi((c) =>
      c.url.includes("opportunities?") ? { json: table([row()]) } : { json: overview() },
    );
    render(<AnalyticsView full title="Analytics" />);
    await screen.findAllByRole("row");
    fireEvent.change(screen.getByLabelText("From (Harare date)"), { target: { value: "2026-11-05" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(screen.getByRole("alert")).toHaveTextContent("end date is before the start date");
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-07" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes("from=2026-11-05&to=2026-11-07"))).toBe(true),
    );
    expect(screen.getByText(/both days included, Harare time/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear dates" }));
    await waitFor(() => expect(calls.at(-1)!.url).toContain("period=30d"));
  });

  it("has an empty search state and an error state for the table", async () => {
    stubApi((c) => (c.url.includes("opportunities?") ? { json: table([]) } : { json: overview() }));
    render(<AnalyticsView full title="Analytics" />);
    expect(await screen.findByText(/No published opportunities to show yet/)).toBeInTheDocument();
  });
});

describe("the Views column", () => {
  const listingRow = (over: Partial<ListingRow>): ListingRow => ({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Driver Salesperson",
    organisation: "Delta Beverages",
    location: "Harare",
    category: { code: "jobs", name: "Jobs" },
    closing: null,
    status: "published",
    status_label: "Published",
    status_tone: "success",
    version_state: null,
    verified: false,
    verification_label: "Not verified",
    verified_at: null,
    verified_by: null,
    can_verify: false,
    submitted_by: null,
    submitted_at: null,
    updated_at: "2026-10-29T17:25:00Z",
    row_version: 1,
    actions: [],
    ...over,
  });

  it("shows each listing's lifetime views when the server sent them", () => {
    render(
      <ListingTable
        caption="Rows"
        rows={[listingRow({ views: 1234 }), listingRow({ id: "x2", title: "Other", views: 0 })]}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Views" })).toBeInTheDocument();
    expect(
      within(table)
        .getAllByTestId("views-cell")
        .map((c) => c.textContent),
    ).toEqual(["1,234", "0"]);
    expect(screen.getByText("Views: 1,234")).toBeInTheDocument(); // and on the phone card
  });

  it("draws no column for people who may not see analytics", () => {
    render(<ListingTable caption="Rows" rows={[listingRow({ views: null }), listingRow({ id: "x2" })]} />);
    expect(screen.queryByRole("columnheader", { name: "Views" })).toBeNull();
    expect(screen.queryByTestId("views-cell")).toBeNull();
  });
});

describe("the view counter in the browser", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
  });
  const sent = (calls: { body: string }[]) => calls.map((c) => JSON.parse(c.body).type);
  function stubBeacon() {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body) });
        return new Response(null, { status: 204 });
      }),
    );
    return calls;
  }

  it("reports one view per tab session however often the page re-renders or remounts", () => {
    const calls = stubBeacon();
    const { rerender, unmount } = render(<ListingEvents slug="a-job-k7m3qp" open />);
    rerender(<ListingEvents slug="a-job-k7m3qp" open />);
    rerender(<ListingEvents slug="a-job-k7m3qp" open />);
    unmount();
    render(<ListingEvents slug="a-job-k7m3qp" open />); // the same tab session, again
    expect(sent(calls)).toEqual(["view"]);
    expect(calls[0]!.url).toBe("/api/v1/opportunities/a-job-k7m3qp/events");
    expect(calls[0]!.body).toBe('{"type":"view"}'); // nothing else is sent
  });

  it("counts a different listing in the same session separately", () => {
    const calls = stubBeacon();
    render(<ListingEvents slug="one-k7m3qp" open />);
    render(<ListingEvents slug="two-k7m3qp" open />);
    expect(calls.map((c) => c.url)).toHaveLength(2);
  });

  it("waits for a hidden tab to be shown, and sends only once", () => {
    const calls = stubBeacon();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<ListingEvents slug="bg-k7m3qp" open />);
    expect(calls).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(sent(calls)).toEqual(["view"]);
  });

  it("does not count an automated browser, a closed listing, or a preview that never mounts it", () => {
    const calls = stubBeacon();
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    render(<ListingEvents slug="auto-k7m3qp" open />);
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    render(<ListingEvents slug="closed-k7m3qp" open={false} />);
    expect(calls).toHaveLength(0);
    expect(
      readRepoFile("apps/web/src/app/workspace/(shell)/opportunities/[id]/preview/page.tsx"),
    ).not.toContain("ListingEvents");
  });

  it("counts apply clicks separately, one per click, and ignores other clicks", () => {
    const calls = stubBeacon();
    render(
      <>
        <ListingEvents slug="click-k7m3qp" open />
        <a href="#x" data-listing-apply>
          Apply Now
        </a>
        <a href="#y">Elsewhere</a>
      </>,
    );
    fireEvent.click(screen.getByText("Apply Now"));
    fireEvent.click(screen.getByText("Elsewhere"));
    expect(sent(calls)).toEqual(["view", "apply"]);
  });

  it("still counts when session storage is blocked, and never throws when the request fails", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(() => render(<ListingEvents slug="blocked-k7m3qp" open />)).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe("staff pages have no hero image, and public ones keep theirs", () => {
  it("the dashboard no longer draws the welcome illustration, and the asset is gone", () => {
    const dashboard = readRepoFile("apps/web/src/app/workspace/(shell)/page.tsx");
    expect(dashboard).not.toMatch(/staff-welcome|next\/image|<Image|<img/);
    expect(existsSync(resolve(repoRoot, "apps/web/public/brand/staff-welcome.webp"))).toBe(false);
    expect(dashboard).toContain('title="Dashboard"');
  });

  it("no staff page draws a decorative picture; the functional image tools remain", () => {
    for (const file of [
      "apps/web/src/app/workspace/(shell)/analytics/page.tsx",
      "apps/web/src/app/workspace/(shell)/opportunities/page.tsx",
      "apps/web/src/app/workspace/(shell)/opportunities/new/page.tsx",
      "apps/web/src/app/workspace/(shell)/team/page.tsx",
      "apps/web/src/app/workspace/(shell)/media/page.tsx",
    ])
      expect(readRepoFile(file)).not.toMatch(/hero|illustration|staff-welcome|<Image|JobSeekerArt/i);
    expect(readRepoFile("apps/web/src/components/workspace/image-upload.tsx")).toContain("uploadImage");
    expect(readRepoFile("apps/web/src/components/workspace/media-browser.tsx")).toContain("MediaBrowser");
  });

  it("the public home page still has its illustration and listing pages their featured image and share image", () => {
    expect(readRepoFile("apps/web/src/components/brand/job-seeker-art.tsx")).toContain("job-seeker.webp");
    expect(readRepoFile("apps/web/src/components/opportunities/featured-image.tsx")).toContain(
      'data-testid="featured-image"',
    );
    expect(readRepoFile("apps/web/src/components/opportunities/job-view.tsx")).toContain("<FeaturedImage");
    expect(readRepoFile("apps/web/src/app/opportunities/[slug]/page.tsx")).toMatch(/shareImage|socialFor/);
  });

  it("the sidebar offers Analytics only with the permission, and the page has a skeleton", () => {
    const chrome = readRepoFile("apps/web/src/components/workspace/chrome.tsx");
    expect(chrome).toMatch(/has\("analytics\.read"\)[\s\S]{0,200}"\/workspace\/analytics"/);
    expect(readRepoFile("apps/web/src/app/workspace/(shell)/analytics/loading.tsx")).toContain(
      "AnalyticsLoading",
    );
    expect(readRepoFile("apps/web/src/app/workspace/(shell)/analytics/page.tsx")).toContain(
      'can(session, "analytics.read")',
    );
  });
});
