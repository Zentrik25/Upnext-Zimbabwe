import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ActionPanel } from "@/components/workspace/action-panel";
import { buildContent, buildDetail, dayOf } from "@/components/workspace/draft-editor";
import { ListingTable } from "@/components/workspace/listing-table";
import { safeNext } from "@/lib/safe-next";
import type { DraftContent, ListingRow, StaffAction, StaffCategory } from "@/lib/staff-types";
import { readRepoFile } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.values(router).forEach((m) => m.mockClear());
});

const category: StaffCategory = {
  code: "jobs",
  name: "Jobs",
  detail_fields: [
    {
      name: "vacancies",
      type: "integer",
      format: null,
      enum: null,
      item_enum: null,
      item_type: null,
      max_length: null,
      required: false,
    },
    {
      name: "minimum_qualification",
      type: "string",
      format: null,
      enum: ["diploma", "bachelors_degree"],
      item_enum: null,
      item_type: null,
      max_length: null,
      required: false,
    },
    {
      name: "benefits",
      type: "array",
      format: null,
      enum: null,
      item_enum: null,
      item_type: "string",
      max_length: null,
      required: false,
    },
    {
      name: "driving_licence_required",
      type: "boolean",
      format: null,
      enum: null,
      item_enum: null,
      item_type: null,
      max_length: null,
      required: false,
    },
    {
      name: "tender_fee",
      type: "object",
      format: null,
      enum: null,
      item_enum: null,
      item_type: null,
      max_length: null,
      required: false,
    },
  ],
};

const existing = {
  locations: [
    { location_id: "loc-1", name: "Harare", is_primary: true },
    { location_id: "loc-2", name: "Bulawayo", is_primary: false },
  ],
  skills: [{ skill_id: "sk-1", name: "Welding", is_required: true }],
  deadline_at: "2027-03-01T21:59:59Z",
} as unknown as DraftContent;

function form(values: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values))
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  return f;
}

describe("draft editor payload (D-46)", () => {
  it("sends nulls for empty optional fields, keeps skills and other locations, and builds sources", () => {
    const { content, errors } = buildContent(
      form({
        title: " Officer ",
        summary: "Short",
        description_md: "Body",
        application_method: "external_url",
        application_url: "https://x.example.org/a",
        application_email: "ignored@example.org",
        location_id: "loc-1",
        deadline_day: "2027-03-01",
        sector: ["s-1", "s-2"],
        source_0_kind: "issuer_website",
        source_0_name: "Careers page",
        source_0_url: "https://x.example.org/jobs",
        source_0_observed_on: "2026-10-29",
        source_primary: "0",
      }),
      category,
      existing,
      [0, 1],
    );
    expect(errors).toEqual({});
    expect(content.title).toBe("Officer");
    expect(content.requirements_md).toBeNull();
    expect(content.application_email).toBeNull(); // only the chosen method's field is sent
    expect(content.locations).toEqual([
      { location_id: "loc-1", is_primary: true },
      { location_id: "loc-2", is_primary: false },
    ]);
    expect(content.skills).toEqual([{ skill_id: "sk-1", is_required: true }]);
    expect(content.sector_ids).toEqual(["s-1", "s-2"]);
    expect(content.sources).toEqual([
      expect.objectContaining({ name: "Careers page", is_primary: true, citation: null }),
    ]); // the empty second row is dropped
    expect("deadline_at" in content).toBe(false); // the day did not change, so the stored deadline is untouched
  });

  it("writes an end-of-day Harare deadline when the day changes and clears it when emptied", () => {
    const base = { title: "T", application_method: "instructions", application_instructions: "Apply" };
    const changed = buildContent(form({ ...base, deadline_day: "2027-04-02" }), category, existing, []);
    expect(changed.content.deadline_at).toBe("2027-04-02T23:59:59+02:00");
    expect(changed.content.deadline_timezone).toBe("Africa/Harare");
    expect(changed.content.deadline_is_date_only).toBe(true);
    const cleared = buildContent(form({ ...base, deadline_day: "" }), category, existing, []);
    expect(cleared.content.deadline_at).toBeNull();
    expect(dayOf("2027-03-01T21:59:59Z")).toBe("2027-03-01");
    expect(dayOf(null)).toBe("");
  });

  it("reads category details by schema type and reports invalid JSON", () => {
    const { detail, errors } = buildDetail(
      form({
        detail_vacancies: "3",
        detail_minimum_qualification: "diploma",
        detail_benefits: "Housing\n  Medical aid \n",
        detail_driving_licence_required: "no",
        detail_tender_fee: "{not json",
      }),
      category.detail_fields,
    );
    expect(detail).toEqual({
      vacancies: 3,
      minimum_qualification: "diploma",
      benefits: ["Housing", "Medical aid"],
      driving_licence_required: false,
    });
    expect(errors["detail.tender_fee"]?.[0]).toMatch(/valid JSON/);
  });
});

describe("action panel", () => {
  const actions: StaffAction[] = [
    { name: "edit", label: "Edit the draft" },
    {
      name: "approve",
      label: "Approve",
      description: "Approve this exact revision.",
      fields: [
        {
          name: "source_reviewed",
          label: "I reviewed the cited source",
          kind: "boolean",
          required: true,
          help: "",
          choices: null,
          min_length: null,
        },
      ],
    },
    { name: "publish", label: "Publish", description: "Publish it.", fields: [] },
  ];

  it("shows only what the API offered and posts the row version with the CSRF header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, init });
        if (url.includes("/auth/csrf"))
          return new Response(JSON.stringify({ csrf_token: "tok" }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
    render(
      <ActionPanel
        endpoint="staff/opportunities/abc/actions"
        editHref="/workspace/opportunities/abc/edit"
        rowVersion={7}
        actions={actions}
      />,
    );
    expect(screen.getByRole("link", { name: "Edit the draft" })).toHaveAttribute(
      "href",
      "/workspace/opportunities/abc/edit",
    );
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByLabelText("I reviewed the cited source"));
    const submit = screen
      .getAllByRole("button", { name: "Approve" })
      .find((b) => b.getAttribute("type") === "submit");
    fireEvent.click(submit!);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    const post = calls.find((c) => c.url.endsWith("/staff/opportunities/abc/actions/approve"));
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post?.init.body))).toEqual({ row_version: 7, source_reviewed: true });
    expect((post?.init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok");
    expect(await screen.findByText("Done: Approve.")).toBeInTheDocument();
  });

  it("shows the service's refusal and its field problems and does not claim success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/auth/csrf")
          ? new Response(JSON.stringify({ csrf_token: "tok" }), { status: 200 })
          : new Response(
              JSON.stringify({
                error: {
                  code: "validation_failed",
                  message: "The content is not valid.",
                  fields: { locations: [{ message: "Choose at least one location." }] },
                },
              }),
              { status: 400 },
            ),
      ),
    );
    render(<ActionPanel endpoint="staff/opportunities/abc/actions" rowVersion={1} actions={[actions[2]!]} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm: Publish" }));
    expect(await screen.findByText(/The content is not valid/)).toBeInTheDocument();
    expect(screen.getByText(/Choose at least one location/)).toBeInTheDocument();
    expect(screen.queryByText(/Done:/)).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("explains separation of duties when no action is available", () => {
    render(<ActionPanel endpoint="staff/opportunities/abc/actions" rowVersion={1} actions={[]} />);
    expect(screen.getByText(/need a different person/)).toBeInTheDocument();
  });
});

describe("listing table", () => {
  const row = (over: Partial<ListingRow> = {}): ListingRow => ({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Solar Officer",
    organisation: "Example Power",
    location: "Harare",
    category: { code: "jobs", name: "Jobs" },
    closing: null,
    status: "in_review",
    status_label: "In review",
    status_tone: "warning",
    version_state: "in_review",
    verification: "not_verified",
    verification_label: "Not verified",
    submitted_by: "Demo Contributor",
    submitted_at: "2026-10-29T17:25:00Z",
    updated_at: "2026-10-29T17:25:00Z",
    row_version: 3,
    actions: [{ name: "approve", label: "Approve" }],
    ...over,
  });

  it("renders the status in words, the unknown deadline as 'Not stated' and links to the detail page", () => {
    render(<ListingTable rows={[row()]} caption="Test rows" />);
    expect(screen.getAllByText("In review").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not stated/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Solar Officer" })[0]).toHaveAttribute(
      "href",
      "/workspace/opportunities/11111111-1111-4111-8111-111111111111",
    );
  });

  it("shows who submitted and when in the queue view", () => {
    render(<ListingTable rows={[row()]} kind="queue" caption="Queue" />);
    expect(screen.getAllByText("Demo Contributor").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Submitted by" })).toBeInTheDocument();
  });
});

describe("workspace plumbing", () => {
  it("accepts only workspace pages as sign-in destinations", () => {
    expect(safeNext("/workspace")).toBe("/workspace");
    expect(safeNext("/workspace/opportunities?queue=review")).toBe("/workspace/opportunities?queue=review");
    expect(safeNext("/workspace/opportunities/11111111-1111-4111-8111-111111111111/edit")).toContain("/edit");
    expect(safeNext("/workspace/records/claims?status=pending")).toBe(
      "/workspace/records/claims?status=pending",
    );
    expect(safeNext("/workspace/a/b/c/d/e")).toBe("/account");
    expect(safeNext("/workspace/..%2f..")).toBe("/account");
    expect(safeNext("//evil.example/workspace")).toBe("/account");
  });

  it("keeps the workspace out of search indexes", () => {
    expect(readRepoFile("apps/web/src/app/robots.ts")).toContain('"/workspace"');
    expect(readRepoFile("apps/web/src/app/workspace/layout.tsx")).toContain("index: false");
  });
});
