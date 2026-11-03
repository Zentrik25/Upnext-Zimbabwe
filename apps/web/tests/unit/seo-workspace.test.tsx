import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/workspace/seo" }));
const staff = vi.hoisted(() => ({ requireStaff: vi.fn(), staffJson: vi.fn(), can: vi.fn() }));
vi.mock("@/lib/staff", () => staff);

import SeoPage from "@/app/workspace/(shell)/seo/page";
import type { SeoReport } from "@/lib/staff-types";

afterEach(() => {
  cleanup();
  for (const fn of Object.values(staff)) fn.mockReset();
  redirect.mockClear();
});

const definitions = {
  queued: "Recorded, not yet sent.",
  accepted: "Google answered HTTP 200. It does not mean the page is crawled, indexed or shown.",
  indexed: "Only URL Inspection reports this.",
  impressions: "Appearances in results.",
  clicks: "Click-throughs.",
};
const base: SeoReport = {
  submissions: {
    enabled: false,
    credentials: "missing",
    service_account: null,
    daily_limit: 150,
    sent_last_24h: 0,
    counts: { pending: 1, retry: 0, sent: 1, dead: 0, skipped: 0 },
    oldest_open_at: "2026-11-03T08:00:00Z",
    recent: [
      {
        id: "1",
        url: "https://upnext.co.zw/opportunities/a-abcdef",
        kind: "URL_UPDATED",
        trigger: "T07",
        status: "sent",
        attempts: 1,
        http_status: 200,
        detail: "",
        created_at: "2026-11-03T08:00:00Z",
        sent_at: "2026-11-03T08:05:00Z",
        google_notify_time: null,
        next_attempt_at: null,
      },
    ],
  },
  search_console: {
    state: "setup_required",
    reason: "Search Console is not connected.",
    steps: ["Create a key.", "Set the property."],
  },
  definitions,
};

async function show(report: SeoReport, allowed = true) {
  staff.requireStaff.mockResolvedValue({ permissions: allowed ? ["settings.manage"] : [] });
  staff.can.mockReturnValue(allowed);
  staff.staffJson.mockResolvedValue({ ok: true, data: report });
  render(await SeoPage());
}

describe("SEO and indexing page", () => {
  it("is for administrators only", async () => {
    staff.requireStaff.mockResolvedValue({ permissions: [] });
    staff.can.mockReturnValue(false);
    await expect(SeoPage()).rejects.toThrow("REDIRECT /workspace");
    expect(staff.staffJson).not.toHaveBeenCalled();
  });
  it("shows a setup-required state with steps and no invented figures", async () => {
    await show(base);
    expect(screen.getByText("Setup required")).toBeInTheDocument();
    expect(screen.getByText("Create a key.")).toBeInTheDocument();
    expect(screen.queryByText("Impressions", { selector: "dt" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+\.\d%/); // no CTR figure
  });
  it("never labels an accepted notification as an indexed page", async () => {
    await show(base);
    const table = screen.getByRole("table", { name: "Most recent Indexing API notifications" });
    expect(within(table).getByText("Accepted by Google")).toBeInTheDocument();
    expect(within(table).queryByText(/indexed/i)).toBeNull();
    expect(screen.getByText(/does not mean the page is crawled, indexed or shown/)).toBeInTheDocument();
    expect(screen.getByText("Submissions off")).toBeInTheDocument();
  });
  it("shows Search Console figures, and Google's own indexed report separately, when connected", async () => {
    await show({
      ...base,
      search_console: {
        state: "ready",
        site: "sc-domain:upnext.co.zw",
        service_account: "sc@proj.iam.gserviceaccount.com",
        period: { start: "2026-10-04", end: "2026-10-31" },
        note: "Search performance lags about three days.",
        totals: { clicks: 12, impressions: 340, ctr: 0.0353, position: 8.5 },
        queries: [{ key: "jobs in harare", clicks: 5, impressions: 90, ctr: 0.05, position: 3.2 }],
        pages: [
          {
            key: "https://upnext.co.zw/locations/harare",
            clicks: 5,
            impressions: 90,
            ctr: 0.05,
            position: 3.2,
          },
        ],
        sitemaps: [
          {
            path: "https://upnext.co.zw/sitemap.xml",
            last_submitted: null,
            last_downloaded: "2026-11-02T00:00:00Z",
            pending: false,
            errors: 0,
            warnings: 1,
            submitted: { web: 40 },
          },
        ],
        inspections: [
          {
            url: "https://upnext.co.zw/opportunities/a-abcdef",
            verdict: "NEUTRAL",
            coverage: "Discovered - currently not indexed",
            rich_results_issues: ["Job postings: Missing field datePosted"],
          },
        ],
      },
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("3.5%")).toBeInTheDocument();
    expect(screen.getByText("jobs in harare")).toBeInTheDocument();
    expect(screen.getByText("/locations/harare")).toBeInTheDocument();
    expect(screen.getByText("Not indexed")).toBeInTheDocument();
    expect(screen.getByText(/Missing field datePosted/)).toBeInTheDocument();
  });
  it("is reachable only from the navigation of an administrator", async () => {
    const chrome = (await import("node:fs")).readFileSync("src/components/workspace/chrome.tsx", "utf8");
    expect(chrome).toMatch(/has\("settings\.manage"\)[\s\S]{0,80}SEO and indexing/);
  });
});
