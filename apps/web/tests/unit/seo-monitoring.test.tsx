import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => router, redirect: (to: string) => redirect(to) }));

const staff = vi.hoisted(() => ({
  codes: ["settings.manage"] as string[],
  documents: {} as Record<string, unknown>,
}));
vi.mock("@/lib/staff", () => ({
  requireStaff: async () => ({ permissions: staff.codes }),
  can: (session: { permissions: string[] }, code: string) => session.permissions.includes(code),
  staffJson: async (path: string) =>
    path in staff.documents ? { ok: true, data: staff.documents[path] } : { ok: false, reason: "http" },
}));

import SeoPage from "@/app/workspace/(shell)/seo/page";
import { SeoRetry } from "@/components/workspace/seo-retry";
import type { SeoNotification, SeoOverview } from "@/lib/staff-types";
import { readRepoFile } from "./helpers";

const OVERVIEW: SeoOverview = {
  mode: "record",
  listings: { open_jobs: 4, eligible_for_job_posting: 3, jobs_in_sitemap: 4, listings_in_sitemap: 9 },
  notifications: {
    pending: 2,
    sending: 0,
    failed: 1,
    sent: 5,
    dead: 1,
    superseded: 3,
    waiting: 3,
    dead_last_24h: 1,
    oldest_waiting_seconds: 600,
    last_sent_at: "2026-11-09T10:00:00Z",
  },
  quota: { used_today: 7, limit: 200 },
  last_run: {
    status: "ok",
    finished_at: "2026-11-10T08:00:00Z",
    last_ok_at: "2026-11-10T08:00:00Z",
    detail: "sent=1",
  },
  structured_data: {
    errors: 1,
    warnings: 2,
    listings: [
      {
        opportunity_id: "11111111-1111-4111-8111-111111111111",
        title: "Remote analyst",
        slug: "remote-analyst-abc123",
        category: "jobs",
        issues: [
          { level: "error", code: "remote_without_country" },
          { level: "warning", code: "no_salary" },
        ],
      },
    ],
  },
  search_console: { connected: false },
};
const DEAD: SeoNotification = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://upnext.co.zw/opportunities/remote-analyst-abc123",
  action: "URL_UPDATED",
  transition: "T07",
  status: "dead",
  attempts: 1,
  response_status: 403,
  last_error: "http_403",
  created_at: "2026-11-10T07:00:00Z",
  next_attempt_at: null,
  sent_at: null,
  opportunity_id: "11111111-1111-4111-8111-111111111111",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  staff.codes = ["settings.manage"];
  Object.values(router).forEach((m) => m.mockClear());
  redirect.mockClear();
});

async function renderPage(status?: string) {
  staff.documents = {
    seo: OVERVIEW,
    [`seo/notifications${status ? `?status=${status}` : ""}`]: { data: [DEAD] },
  };
  render(await SeoPage({ searchParams: Promise.resolve(status ? { status } : {}) }));
}

describe("SEO monitoring page (Administrators)", () => {
  it("shows the queue, sitemap and structured-data figures without claiming indexing", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "SEO monitoring" })).toBeTruthy();
    expect(screen.getByText(/Record: notifications are queued for inspection; nothing is sent/)).toBeTruthy();
    expect(screen.getByText("Sent (accepted by Google)")).toBeTruthy();
    expect(screen.getByText(/not.*that the page is indexed or ranked/i)).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getByText("1 error")).toBeTruthy();
    expect(screen.getByText("2 warnings")).toBeTruthy();
    expect(screen.getByText(/Remote with no “Zimbabwe” location/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Remote analyst" }).getAttribute("href")).toBe(
      "/workspace/opportunities/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByText("/opportunities/remote-analyst-abc123")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry all dead notifications" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    // never an indexing claim the Indexing API cannot support
    const text = (document.body.textContent ?? "").replace("not that the page is indexed or ranked", "");
    expect(text).not.toMatch(/\bis indexed\b|\bwas indexed\b|indexed pages: \d/i);
  });

  it("filters by a known status only", async () => {
    await renderPage("dead");
    expect(screen.getByRole("link", { name: "Dead" }).getAttribute("aria-current")).toBe("page");
  });

  it("sends anyone without settings.manage back to the workspace", async () => {
    staff.codes = ["opp.review.approve", "analytics.read"];
    await expect(SeoPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/workspace");
  });

  it("is listed in the navigation only for settings.manage", () => {
    const chrome = readRepoFile("apps/web/src/components/workspace/chrome.tsx");
    expect(chrome).toMatch(/has\("settings\.manage"\)\) \{[\s\S]{0,200}"\/workspace\/seo"/);
  });
});

describe("SeoRetry", () => {
  it("posts with the CSRF token and refreshes the page", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.includes("/auth/csrf"))
          return new Response(JSON.stringify({ csrf_token: "tok" }), { status: 200 });
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: DEAD.id, status: "pending" }), { status: 200 });
      }),
    );
    render(<SeoRetry id={DEAD.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Queued again.")).toBeTruthy());
    expect(calls[0]!.url).toContain(`/staff/seo/notifications/${DEAD.id}/retry`);
    expect(calls[0]!.init.method).toBe("POST");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/auth/csrf"))
          return new Response(JSON.stringify({ csrf_token: "tok" }), { status: 200 });
        return new Response(
          JSON.stringify({
            error: {
              code: "superseded",
              message: "A newer notification for this address replaces this one.",
            },
          }),
          { status: 409 },
        );
      }),
    );
    render(<SeoRetry id={DEAD.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
