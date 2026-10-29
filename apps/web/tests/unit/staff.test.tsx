import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination, StatusBadge, PageHeader } from "@/components/staff/primitives";
import { StaffShell, type NavGroup } from "@/components/staff/shell";
import { OpportunityTable } from "@/components/staff/opportunity-table";
import { dateInputValue, formatClosing, harareToIso, timeInputValue } from "@/lib/staff-format";
import type { OpportunityRow } from "@/lib/staff-types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/staff/opportunities",
  useSearchParams: () => new URLSearchParams("view=drafts"),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const groups: NavGroup[] = [
  { title: "", items: [{ href: "/staff", label: "Dashboard" }] },
  {
    title: "Opportunities",
    items: [
      { href: "/staff/opportunities", label: "All Opportunities", view: "all" },
      { href: "/staff/opportunities?view=drafts", label: "Drafts", view: "drafts" },
    ],
  },
  { title: "Editorial", items: [{ href: "/staff/review", label: "Review Queue", badge: 3 }] },
];

const row = (over: Partial<OpportunityRow> = {}): OpportunityRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  title: "Field Officer",
  organisation: { id: "o1", name: "Example Trust", verified: false },
  category: { code: "jobs", name: "Jobs" },
  location: "Harare",
  status: "draft",
  version_state: "draft",
  closing: { at: null, timezone: null, is_date_only: false },
  author: { id: "u1", name: "Demo Editor" },
  authored_by_you: true,
  employer_owned: false,
  direct_publication: false,
  slug: null,
  row_version: 1,
  updated_at: null,
  actions: ["edit"],
  ...over,
});

describe("staff formatting", () => {
  it("keeps Harare dates and the fixed +02:00 offset", () => {
    expect(harareToIso("2026-12-19", "")).toBe("2026-12-19T23:59:59+02:00");
    expect(harareToIso("2026-12-19", "09:30")).toBe("2026-12-19T09:30:00+02:00");
    const iso = harareToIso("2026-12-19", "09:30");
    expect(dateInputValue(iso, "Africa/Harare")).toBe("2026-12-19");
    expect(timeInputValue(iso, "Africa/Harare")).toBe("09:30");
  });
  it("never invents a closing date", () => {
    expect(formatClosing({ at: null, is_date_only: false })).toBe("Not stated");
  });
});

describe("staff primitives", () => {
  it("labels status in words, not colour alone", () => {
    render(<StatusBadge status="in_review" />);
    expect(screen.getByText("In review")).toBeTruthy();
  });
  it("renders a heading and actions", () => {
    render(<PageHeader title="Drafts" lead="Lead" actions={<button>Go</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Drafts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  });
  it("paginates with links that keep context and disables the ends", () => {
    render(
      <Pagination
        page={{ number: 1, size: 25, total: 40, pages: 2 }}
        hrefFor={(p) => `/x?page=${p}`}
        noun="rows"
      />,
    );
    expect(screen.getByText("1-25 of 40 rows")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/x?page=2");
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  });
});

describe("staff shell", () => {
  it("marks the current page, shows queue badges and a labelled landmark", () => {
    render(
      <StaffShell groups={groups} user={{ name: "Demo Editor", role: "Editor" }}>
        <p>Body</p>
      </StaffShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Staff" })[0]!;
    expect(within(nav).getByRole("link", { name: "Drafts" }).getAttribute("aria-current")).toBe("page");
    expect(
      within(nav).getByRole("link", { name: "All Opportunities" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(within(nav).getByText("3 waiting:")).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("search")).toBeTruthy();
  });
  it("opens the mobile menu as a modal dialog and closes it with Escape", () => {
    render(
      <StaffShell groups={groups} user={{ name: "Demo Editor", role: "Editor" }}>
        <p>Body</p>
      </StaffShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Staff menu" }).getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("opportunity table", () => {
  it("shows the required columns, verified labels and permission-driven actions", () => {
    render(
      <OpportunityTable
        caption="Test"
        sort="title"
        dir="asc"
        hrefFor={(k, d) => `/staff/opportunities?sort=${k}&dir=${d}`}
        rows={[
          row(),
          row({
            id: "22222222-2222-2222-2222-222222222222",
            title: "Employer job",
            employer_owned: true,
            organisation: { id: "o2", name: "Verified Co", verified: true },
            actions: [],
          }),
        ]}
      />,
    );
    for (const h of [
      "Opportunity",
      "Organisation",
      "Category",
      "Location",
      "Status",
      "Closing",
      "Author",
      "Actions",
    ]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(h) })).toBeTruthy();
    }
    expect(screen.getByRole("columnheader", { name: /Opportunity/ }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
    expect(screen.getByText("Entered by staff")).toBeTruthy();
    expect(screen.getByText("Verified employer")).toBeTruthy();
    expect(screen.getByText("Employer submission")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" })).toBeTruthy();
  });
});
