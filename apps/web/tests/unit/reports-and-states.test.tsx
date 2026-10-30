// M2: public reporting form, loading placeholders, route-level loading files and the error views.
import axe from "axe-core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import { ReportForm, REPORT_REASONS } from "@/components/opportunities/report-form";
import { ErrorView } from "@/components/ui/error-view";
import { LoadingRegion, SkeletonListingRows } from "@/components/ui";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

function script(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const reply = replies.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: reply.headers,
      });
    }),
  );
  return calls;
}

async function violations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill(details = "They asked me to pay a fee before the interview.") {
  fireEvent.click(screen.getByLabelText("Recruitment scam or payment request"));
  fireEvent.change(screen.getByLabelText(/Tell us what concerns you/), { target: { value: details } });
}

describe("ReportForm", () => {
  it("offers exactly the seven reasons, each with a visible label", () => {
    render(<ReportForm slug="graduate-engineer" title="Graduate Engineer" />);
    expect(REPORT_REASONS.map((r) => r.label)).toEqual([
      "Suspected fake job",
      "Recruitment scam or payment request",
      "Incorrect application information",
      "Expired listing",
      "Misleading content",
      "Duplicate listing",
      "Other concern",
    ]);
    for (const reason of REPORT_REASONS) expect(screen.getByLabelText(reason.label)).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("has no accessibility violations, with and without errors", async () => {
    const { container } = render(<ReportForm slug="x" title="X" />);
    expect(await violations(container)).toEqual([]);
    fireEvent.submit(screen.getByTestId("report-form"));
    await screen.findByText(/to fix/);
    expect(await violations(container)).toEqual([]);
  });

  it("checks required fields before sending anything", async () => {
    const calls = script();
    render(<ReportForm slug="x" title="X" />);
    fireEvent.submit(screen.getByTestId("report-form"));
    expect(
      await screen.findByText("Choose what is wrong with this opportunity.", { selector: "a" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Write at least 10 characters/).length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it("sends the report and shows the reference", async () => {
    const calls = script({ status: 202, body: { reference: "R-ABCD2345", message: "ok" } });
    render(<ReportForm slug="graduate-engineer" title="Graduate Engineer" />);
    fill();
    fireEvent.change(screen.getByLabelText(/Link that shows the problem/), {
      target: { value: "https://example.org/proof" },
    });
    fireEvent.submit(screen.getByTestId("report-form"));
    expect(await screen.findByTestId("report-reference")).toHaveProperty("textContent", "R-ABCD2345");
    expect(calls[0]!.url).toBe("/api/v1/opportunities/graduate-engineer/reports");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      reason: "payment_scam",
      details: "They asked me to pay a fee before the interview.",
      evidence_url: "https://example.org/proof",
      contact_email: null,
      website: "",
    });
    // focus moves in an effect that runs just after the confirmation appears: wait for it instead of racing it
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("report-done")));
    expect(screen.getByText(/not removed automatically/)).toBeTruthy();
  });

  it("shows server field errors next to the fields", async () => {
    script({
      status: 400,
      body: {
        error: {
          code: "validation_failed",
          message: "Check the highlighted fields.",
          fields: { evidence_url: [{ code: "invalid_url", message: "Use an https:// link." }] },
        },
      },
    });
    render(<ReportForm slug="x" title="X" />);
    fill();
    fireEvent.submit(screen.getByTestId("report-form"));
    expect(await screen.findAllByText(/Use an https:\/\/ link\./)).not.toHaveLength(0);
    expect(screen.getByLabelText(/Link that shows the problem/).getAttribute("aria-invalid")).toBe("true");
  });

  it("explains rate limiting and keeps what was typed", async () => {
    script({
      status: 429,
      headers: { "Retry-After": "1800" },
      body: { error: { code: "rate_limited", message: "Too many requests." } },
    });
    render(<ReportForm slug="x" title="X" />);
    fill();
    fireEvent.submit(screen.getByTestId("report-form"));
    expect(await screen.findByText(/Try again in 30 minutes/)).toBeTruthy();
    expect((screen.getByLabelText(/Tell us what concerns you/) as HTMLTextAreaElement).value).toContain(
      "fee",
    );
  });

  it("says so when the listing is gone, and when the service is unreachable", async () => {
    script({ status: 404, body: { error: { code: "not_found", message: "Not found." } } });
    render(<ReportForm slug="x" title="X" />);
    fill();
    fireEvent.submit(screen.getByTestId("report-form"));
    expect(await screen.findByText(/no longer available to report/)).toBeTruthy();
    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    render(<ReportForm slug="x" title="X" />);
    fill();
    fireEvent.submit(screen.getByTestId("report-form"));
    await waitFor(() => expect(screen.getByText(/could not be reached/)).toBeTruthy());
  });

  it("keeps the honeypot out of reach of people and assistive technology", () => {
    render(<ReportForm slug="x" title="X" />);
    const trap = document.getElementById("website")!;
    expect(trap.getAttribute("tabindex")).toBe("-1");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("loading placeholders", () => {
  it("announce once and hide the decorative blocks", async () => {
    const { container } = render(
      <LoadingRegion label="opportunities">
        <SkeletonListingRows count={3} />
      </LoadingRegion>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(region.textContent).toContain("Loading opportunities…");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Loading opportunities…");
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(await violations(container)).toEqual([]);
  });

  it("keeps individual blocks still: the only motion is one pulse on the region (see skeleton-system.test.tsx)", () => {
    const { container } = render(<SkeletonListingRows count={2} />);
    expect(container.innerHTML).not.toMatch(/animate-|transition|shimmer|pulse/);
  });

  it("exists for each private data-driven route and not for public ones", () => {
    const root = join(__dirname, "../../src/app");
    const need = [
      "for-you/loading.tsx",
      "saved/loading.tsx",
      "dashboard/loading.tsx",
      "alerts/loading.tsx",
      "profile/loading.tsx",
      "account/loading.tsx",
      "employer/loading.tsx",
      "error.tsx",
      "global-error.tsx",
    ];
    for (const file of need) expect(statSync(join(root, file)).isFile(), file).toBe(true);
    // Public routes must stay without one: it would turn an unknown listing's 404 into a streamed 200.
    expect(readdirSync(root)).not.toContain("loading.tsx");
    expect(readdirSync(join(root, "opportunities"))).not.toContain("loading.tsx");
    expect(readdirSync(join(root, "opportunities/[slug]"))).not.toContain("loading.tsx");
  });
});

describe("error views", () => {
  it("offers an accessible retry that calls reset, focuses the heading and shows only the reference", async () => {
    const reset = vi.fn();
    const { container } = render(<ErrorView reset={reset} digest="abc123" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Something went wrong" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("abc123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
    expect(await violations(container)).toEqual([]);
  });

  it("never prints the error text", () => {
    const error = Object.assign(new Error("password=hunter2 at db.internal"), { digest: "d1" });
    render(<ErrorPage error={error} reset={vi.fn()} />);
    expect(document.body.textContent).not.toContain("hunter2");
    expect(document.body.textContent).toContain("d1");
  });

  it("the global error page renders its own document structure", () => {
    const html = render(<GlobalError error={new Error("x")} reset={vi.fn()} />, {
      container: document.createElement("div"),
    });
    expect(html.container.textContent).toContain("Something went wrong");
  });
});
