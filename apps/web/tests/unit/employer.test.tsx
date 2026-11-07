import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/employer",
  useSearchParams: () => new URLSearchParams(),
}));

import { ClaimForm } from "@/components/employer/claim-form";
import { ListingTable } from "@/components/employer/listing-table";
import { OpportunityForm } from "@/components/employer/opportunity-form";
import { RowActions } from "@/components/employer/row-actions";
import { EmployerShell, employerNav } from "@/components/employer/shell";
import { StatCards } from "@/components/employer/stat-cards";
import { ProfileForm } from "@/components/employer/profile-form";
import { StatusTag } from "@/components/employer/parts";
import { ListingEvents } from "@/components/opportunities/listing-events";
import { CLAIM_LABEL, STATUS_LABEL, type EmployerListingRow, type ProfileState } from "@/lib/employer-types";

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

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  window.sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CATEGORIES = [
  {
    code: "jobs",
    name: "Job",
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
    ],
  },
  {
    code: "internships",
    name: "Internship",
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
        name: "placement_type",
        type: "string",
        format: null,
        enum: ["internship", "practicum"],
        item_enum: null,
        item_type: null,
        max_length: null,
        required: true,
      },
    ],
  },
];
const ORG = { id: "org-1", name: "Delta Beverages" };
const PLACES = [
  { id: "loc-harare", slug: "harare", name: "Harare", kind: "city", parent_slug: null },
  { id: "loc-byo", slug: "bulawayo", name: "Bulawayo", kind: "city", parent_slug: null },
];
const typeInto = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** The visual editor is a text box, not a field: its words are typed into it and it reports an input event. */
const typeIntoEditor = (label: string | RegExp, text: string) => {
  const box = screen.getByRole("textbox", { name: label });
  box.textContent = text;
  fireEvent.input(box);
};

describe("opportunity form (D-70)", () => {
  const renderForm = () =>
    render(<OpportunityForm organisation={ORG} categories={CATEGORIES} locations={PLACES} sectors={[]} />);

  it("has no organisation control: the organisation is fixed and only named", () => {
    renderForm();
    expect(screen.queryByLabelText(/^Organisation/)).toBeNull();
    expect(screen.queryByRole("combobox", { name: /organisation/i })).toBeNull();
    expect(screen.getByTestId("organisation-fixed").textContent).toContain("Delta Beverages");
  });

  it("shows the simplified fields and keeps the advanced parts closed", () => {
    renderForm();
    for (const name of [
      /Job title/,
      /Number of vacancies/,
      /^Location/,
      /Job type/,
      /Salary/,
      /Closing date/,
      /Job overview/,
      /Key responsibilities/,
      /Qualifications & experience/,
    ])
      expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "How people apply" })).toBeTruthy();
    for (const id of ["media", "more", "source"]) {
      const section = document.getElementById(id) as HTMLDetailsElement;
      expect(section.tagName).toBe("DETAILS");
      expect(section.open).toBe(false);
    }
    expect(screen.getByText("Media & SEO")).toBeTruthy();
    expect(screen.getByText("Additional details")).toBeTruthy();
    expect(screen.getByText("Source & verification")).toBeTruthy();
  });

  it("offers no way to set an address, search text, sources, verification or approval", () => {
    renderForm();
    for (const name of [
      /URL slug|Unique slug|Page address/i,
      /SEO title/i,
      /SEO description/i,
      /Open Graph/i,
      /^Verified/i,
      /Approve/i,
      /Publish/i,
    ])
      expect(screen.queryByLabelText(name)).toBeNull();
    expect(screen.queryByRole("button", { name: /approve|publish|verify/i })).toBeNull();
    expect(screen.getByTestId("seo-note").textContent).toMatch(/written by UPNEXT editors/);
  });

  it.each([
    ["external_url", ["Application website"], ["Application e-mail", "E-mail subject"]],
    ["email", ["Application e-mail", "E-mail subject"], ["Application website"]],
    ["both", ["Application website", "Application e-mail"], []],
    ["instructions", ["Application instructions"], ["Application website", "Application e-mail"]],
  ])("application method %s shows the right destinations", (method, shown, hidden) => {
    renderForm();
    fireEvent.change(screen.getByRole("combobox", { name: "How people apply" }), {
      target: { value: method },
    });
    for (const label of shown) expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeTruthy();
    for (const label of hidden) expect(screen.queryByLabelText(new RegExp(`^${label}`))).toBeNull();
  });

  it("creates the draft with the category and no organisation, address or search text", async () => {
    const calls = script({ status: 201, body: { id: "opp-1", row_version: 1 } });
    renderForm();
    typeInto(/Job title/, "Stock Controllers (3 Posts) - Grade G");
    typeInto(/^Location/, "Harare and Bulawayo");
    typeInto(/Number of vacancies/, "3");
    typeInto(/Salary/, "US$450 per month");
    typeIntoEditor(/Key responsibilities/, "- Count stock");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/employer/listings/opp-1"));
    expect(calls[0]!.url).toBe("/api/v1/employer/organisations/org-1/listings");
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent.category).toBe("jobs");
    for (const key of [
      "organisation_id",
      "slug",
      "seo_title",
      "seo_description",
      "og_title",
      "og_description",
      "sources",
    ])
      expect(sent.content).not.toHaveProperty(key);
    expect(sent.content).toMatchObject({
      title: "Stock Controllers (3 Posts) - Grade G",
      description_md: "- Count stock",
      salary_text: "US$450 per month",
      location_text: "Harare and Bulawayo",
      locations: [
        { location_id: "loc-harare", is_primary: true },
        { location_id: "loc-byo", is_primary: false },
      ],
      detail: { vacancies: 3 },
      application_method: "external_url",
    });
  });

  it("shows the server's field errors, opens the closed part that holds one, and never loses the typing", async () => {
    script({
      status: 400,
      body: {
        error: {
          code: "validation_failed",
          message: "m",
          request_id: "r",
          fields: {
            title: [{ code: "x", message: "At least 5 characters." }],
            "detail.placement_type": [{ code: "required", message: "Choose a placement type." }],
          },
        },
      },
    });
    render(
      <OpportunityForm
        organisation={ORG}
        categories={CATEGORIES}
        locations={PLACES}
        sectors={[]}
        listing={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("What are you posting?"), { target: { value: "internships" } });
    typeInto(/Job title/, "Hi");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/At least 5 characters/)).toBeTruthy();
    expect(screen.getByText(/Choose a placement type/)).toBeTruthy();
    expect((document.getElementById("more") as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByLabelText(/Job title/) as HTMLInputElement).value).toBe("Hi");
  });

  it("submits for review only after saving, using the fresh row version", async () => {
    const calls = script(
      { status: 201, body: { id: "opp-2", row_version: 1 } },
      { status: 200, body: { id: "opp-2", row_version: 4 } },
      { status: 200, body: {} },
    );
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url}`)).toEqual([
      "POST /api/v1/employer/organisations/org-1/listings",
      "GET /api/v1/employer/listings/opp-2",
      "POST /api/v1/employer/listings/opp-2/submit",
    ]);
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ row_version: 4 });
  });

  it("uploads pictures to the employer endpoint and attaches the stored name", async () => {
    class Xhr {
      static url = "";
      upload = { onprogress: null };
      status = 201;
      responseText = JSON.stringify({
        name: "listings/abc.jpg",
        url: "/media/listings/abc.jpg",
        width: 1,
        height: 1,
        bytes: 9,
      });
      withCredentials = false;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open(_m: string, url: string) {
        Xhr.url = url;
      }
      setRequestHeader() {}
      abort() {}
      send() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("XMLHttpRequest", Xhr);
    script({ status: 200, body: { csrf_token: "t" } });
    const calls = script({ status: 201, body: { id: "opp-3", row_version: 1 } });
    renderForm();
    const details = document.getElementById("media") as HTMLDetailsElement;
    details.open = true;
    const input = details.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() =>
      expect(screen.getAllByText("The image is saved with the draft.").length).toBeGreaterThan(0),
    );
    expect(Xhr.url).toBe("/api/v1/employer/images");
    typeInto(/Job title/, "Warehouse Clerk");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/listings"))).toBe(true));
    const post = calls.find((c) => c.url.endsWith("/listings"))!;
    expect(JSON.parse(String(post.init.body)).content.featured_image).toBe("listings/abc.jpg");
  });
});

describe("employer shell", () => {
  const org = {
    id: "org-1",
    name: "Delta Beverages",
    role: "owner" as const,
    verified: true,
    profile_slug: null,
    profile_pending: false,
    listing_count: 12,
    counts: { total: 12, active: 8, drafts: 2, in_review: 1, changes_requested: 1, expired: 2, withdrawn: 0 },
  };

  it("lists the seven places, no Team Members, and the organisation at the bottom", () => {
    const items = employerNav(org);
    expect(items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Opportunities",
      "Create Opportunity",
      "Drafts",
      "Analytics",
      "Company Profile",
      "Settings",
    ]);
    expect(items.find((i) => i.label === "Company Profile")!.href).toBe(
      "/employer/organisations/org-1/profile",
    );
    expect(items.find((i) => i.label === "Drafts")!.href).toBe("/employer/opportunities?status=draft");
    expect(items.some((i) => /team/i.test(i.label))).toBe(false);
  });

  it("offers an account with no organisation only the claim and its settings", () => {
    expect(employerNav(null).map((i) => i.label)).toEqual(["Dashboard", "Claim an organisation", "Settings"]);
  });

  it("renders the frame with the organisation, a labelled navigation and a drawer button", () => {
    render(
      <EmployerShell
        user={{ name: "Delta Boss", email: "boss@example.org", homePath: "/employer" }}
        organisations={[org]}
        active={org}
      >
        <p>Body</p>
      </EmployerShell>,
    );
    expect(screen.getByRole("navigation", { name: "Employer" })).toBeTruthy();
    expect(screen.getByTestId("active-organisation").textContent).toContain("Delta Beverages");
    expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Employer Dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});

describe("dashboard parts", () => {
  it("shows the four counts it is given and links each to the filtered list", () => {
    render(
      <StatCards
        counts={{
          total: 12,
          active: 8,
          drafts: 2,
          in_review: 1,
          changes_requested: 0,
          expired: 2,
          withdrawn: 0,
        }}
      />,
    );
    expect(screen.getByTestId("stat-total").textContent).toBe("12");
    expect(screen.getByTestId("stat-active").textContent).toBe("8");
    expect(screen.getByTestId("stat-drafts").textContent).toBe("2");
    expect(screen.getByTestId("stat-expired").textContent).toBe("2");
    expect(screen.getByRole("link", { name: /Drafts/ }).getAttribute("href")).toBe(
      "/employer/opportunities?status=draft",
    );
  });

  const row = (over: Partial<EmployerListingRow>): EmployerListingRow => ({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Driver Salesperson",
    category: { code: "jobs", name: "Job" },
    status: "published",
    version_state: "published",
    row_version: 3,
    slug: "driver-salesperson-abc123",
    updated_at: null,
    decision: null,
    next_actions: ["amend", "close"],
    employment_type: "permanent",
    location: "Harare",
    published_at: "2026-10-28T08:00:00Z",
    deadline_at: null,
    can_duplicate: true,
    public_path: "/opportunities/driver-salesperson-abc123",
    views: 687,
    apply_clicks: 54,
    ...over,
  });

  it("shows real views and apply clicks, a dash for a listing never published, and clear status words", () => {
    render(
      <ListingTable
        rows={[
          row({}),
          row({
            id: "22222222-2222-4222-8222-222222222222",
            title: "Storekeeper",
            status: "draft",
            published_at: null,
            views: 0,
            apply_clicks: 0,
            next_actions: ["edit", "submit", "discard"],
            employment_type: "full_time",
            location: "Bulawayo",
          }),
        ]}
        empty="none"
      />,
    );
    const rows = screen.getAllByTestId("employer-listing");
    expect(rows[0]!.textContent).toContain("687");
    expect(rows[0]!.textContent).toContain("Active");
    expect(rows[0]!.textContent).toContain("Permanent");
    expect(rows[1]!.textContent).toContain("Draft");
    expect(rows[1]!.textContent).not.toMatch(/\b0\b/);
    expect(rows[1]!.textContent).toContain("—");
    expect(screen.getByRole("columnheader", { name: "Apply clicks" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /^Applications$/ })).toBeNull();
  });

  it("offers only the actions allowed by the listing's state", () => {
    const { unmount } = render(
      <RowActions row={row({ status: "draft", next_actions: ["edit", "submit", "discard"] })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Actions for Driver Salesperson/ }));
    const labels = () => screen.getAllByRole("menuitem", { hidden: true }).length;
    expect(screen.getByText("Submit for review")).toBeTruthy();
    expect(screen.getByText("Delete draft")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("Duplicate")).toBeTruthy();
    expect(screen.queryByText("Withdraw")).toBeNull();
    expect(labels).toBeDefined();
    unmount();
    render(<RowActions row={row({ status: "in_review", next_actions: [], can_duplicate: true })} />);
    fireEvent.click(screen.getByRole("button", { name: /Actions for Driver Salesperson/ }));
    for (const gone of ["Submit for review", "Delete draft", "Withdraw", "Edit"])
      expect(screen.queryByText(gone)).toBeNull();
    expect(screen.getByText("View")).toBeTruthy();
    for (const role of ["button", "link"] as const)
      expect(screen.queryByRole(role, { name: /approve|publish|verify/i })).toBeNull();
  });

  it("shows Withdraw only for a published listing", () => {
    render(<RowActions row={row({})} />);
    fireEvent.click(screen.getByRole("button", { name: /Actions for Driver Salesperson/ }));
    expect(screen.getByText("Withdraw")).toBeTruthy();
    expect(screen.getByText("Edit (start an amendment)")).toBeTruthy();
    expect(screen.queryByText("Delete draft")).toBeNull();
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
