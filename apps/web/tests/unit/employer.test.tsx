import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ClaimForm } from "@/components/employer/claim-form";
import { buildContent, ListingForm } from "@/components/employer/listing-form";
import { ProfileForm } from "@/components/employer/profile-form";
import { StatusTag } from "@/components/employer/parts";
import { ListingEvents } from "@/components/opportunities/listing-events";
import { CLAIM_LABEL, STATUS_LABEL, type ProfileState } from "@/lib/employer-types";

type Reply = { status?: number; body?: unknown };

function script(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const reply = replies.shift() ?? { status: 200, body: {} };
      const status = reply.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), { status });
    }),
  );
  return calls;
}

function formOf(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  window.sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("listing request body", () => {
  const base = { title: "Mining engineer", application_method: "external_url" };

  it("sends optional fields as null and never invents pay or a deadline", () => {
    const body = buildContent(formOf({ ...base, summary: "", description_md: "" }), "jobs");
    expect(body).toMatchObject({
      requirements_md: null,
      work_mode: null,
      salary: null,
      deadline_at: null,
      deadline_timezone: null,
      deadline_is_date_only: false,
      locations: [],
      detail: {},
    });
  });

  it("turns a closing date into the end of that day in Harare and keeps only the chosen application method", () => {
    const body = buildContent(
      formOf({
        ...base,
        deadline_day: "2026-12-01",
        application_url: "https://careers.example.org/job",
        application_email: "ignored@example.org",
        location_id: "loc-1",
        salary_min: "700",
        salary_currency: "USD",
        salary_period: "month",
      }),
      "jobs",
    );
    expect(body).toMatchObject({
      deadline_at: "2026-12-01T23:59:59+02:00",
      deadline_timezone: "Africa/Harare",
      deadline_is_date_only: true,
      application_url: "https://careers.example.org/job",
      application_email: null,
      locations: [{ location_id: "loc-1", is_primary: true }],
      salary: { min: "700", max: null, currency: "USD", period: "month" },
    });
  });

  it("includes only the detail fields of the category", () => {
    const form = formOf({
      ...base,
      vacancies: "3",
      placement_type: "internship",
      duration_months: "6",
      minimum_qualification: "diploma",
      programme_length_months: "18",
    });
    expect(buildContent(form, "internships").detail).toEqual({
      vacancies: 3,
      placement_type: "internship",
      duration_months: 6,
    });
    expect(buildContent(form, "jobs").detail).toEqual({ vacancies: 3, minimum_qualification: "diploma" });
    expect(buildContent(form, "graduate-programmes").detail).toEqual({
      vacancies: 3,
      programme_length_months: 18,
    });
  });
});

describe("listing form", () => {
  it("saves a new draft and then goes to it; server errors appear next to the fields", async () => {
    const calls = script(
      {
        status: 400,
        body: {
          error: {
            code: "validation_failed",
            message: "m",
            request_id: "r",
            fields: { title: [{ code: "x", message: "At least 5 characters." }] },
          },
        },
      },
      { status: 201, body: { id: "opp-1", row_version: 1 } },
    );
    render(<ListingForm organisationId="org-1" locations={[{ id: "loc-1", name: "Harare" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/At least 5 characters/)).toBeTruthy();
    expect(calls[0]!.url).toBe("/api/v1/employer/organisations/org-1/listings");
    expect(JSON.parse(String(calls[0]!.init.body)).category).toBe("jobs");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/employer/listings/opp-1"));
  });

  it("submits for review only after the draft was saved, using the new row version", async () => {
    const calls = script({ status: 201, body: { id: "opp-2", row_version: 4 } }, { status: 200, body: {} });
    render(<ListingForm organisationId="org-1" locations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(calls.map((c) => c.url)).toEqual([
      "/api/v1/employer/organisations/org-1/listings",
      "/api/v1/employer/listings/opp-2/submit",
    ]);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ row_version: 4 });
    expect(screen.queryByText(/not ready to submit/)).toBeNull();
  });
});

describe("claim form", () => {
  it("sends the claim and goes to the dashboard", async () => {
    const calls = script({ status: 200, body: { data: [] } }, { status: 201, body: { id: "c1" } });
    render(<ClaimForm />);
    fireEvent.change(screen.getByLabelText("Organisation name"), { target: { value: "Acme Mining" } });
    fireEvent.change(screen.getByLabelText("Your role"), { target: { value: "HR manager" } });
    fireEvent.change(screen.getByLabelText(/How can we confirm/), {
      target: { value: "Our official address is hr@acme.example.org and registration is on file." },
    });
    fireEvent.submit(screen.getByTestId("claim-form"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/employer"));
    const post = calls.find((c) => c.url.endsWith("/employer/claims"))!;
    expect(JSON.parse(String(post.init.body))).toMatchObject({
      organisation_name: "Acme Mining",
      role_title: "HR manager",
    });
  });
});

describe("profile form", () => {
  const state = (over: Partial<ProfileState>): ProfileState => ({
    organisation: { id: "o", name: "Acme" },
    verified: true,
    can_edit: true,
    slug: null,
    live: null,
    pending: null,
    last_rejected: null,
    sectors: [],
    size_bands: ["1-10"],
    ...over,
  });

  it("is read-only for recruiters and for organisations that are not verified", () => {
    const { unmount } = render(<ProfileForm organisationId="o" state={state({ can_edit: false })} />);
    expect(screen.getByTestId("profile-readonly")).toBeTruthy();
    unmount();
    render(<ProfileForm organisationId="o" state={state({ verified: false })} />);
    expect(screen.getByText(/not verified/)).toBeTruthy();
  });
});

describe("listing events", () => {
  it("reports one view per tab session and apply clicks, with only the event name", async () => {
    const calls = script();
    const { unmount } = render(
      <>
        <ListingEvents slug="mining-engineer-abc123" open />
        <a href="https://x.example.org" data-listing-apply onClick={(e) => e.preventDefault()}>
          Apply
        </a>
        <a href="https://y.example.org" onClick={(e) => e.preventDefault()}>
          Other
        </a>
      </>,
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe("/api/v1/opportunities/mining-engineer-abc123/events");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ type: "view" });
    expect(calls[0]!.init.credentials).toBe("omit");
    fireEvent.click(screen.getByText("Other"));
    expect(calls).toHaveLength(1);
    fireEvent.click(screen.getByText("Apply"));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ type: "apply" });
    unmount();
    render(<ListingEvents slug="mining-engineer-abc123" open />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(2); // the same tab does not count the same listing twice
  });

  it("counts nothing for a listing that is not open", async () => {
    const calls = script();
    render(<ListingEvents slug="closed-listing-abc123" open={false} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });
});

describe("status words", () => {
  it("every status has a text label, so colour is never the only cue", () => {
    for (const label of [...Object.values(STATUS_LABEL), ...Object.values(CLAIM_LABEL)]) {
      expect(label.length).toBeGreaterThan(3);
    }
    render(<StatusTag status="rejected" />);
    expect(screen.getByText("Returned with reasons")).toBeTruthy();
  });
});
