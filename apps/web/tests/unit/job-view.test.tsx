import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { JobView } from "@/components/opportunities/job-view";
import { ShareButton } from "@/components/opportunities/share-button";
import { StickyApply } from "@/components/opportunities/sticky-apply";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { mailtoHref, salaryLine } from "@/lib/format";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FUTURE = new Date(Date.now() + 20 * 864e5).toISOString();

function listing(over: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: "id-1",
    slug: "senior-accountant-k7m3qp",
    title: "Senior Accountant",
    summary: "Lead the finance team of a water authority.",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o1", name: "Example Water Authority" },
    locations: [
      { slug: "harare", name: "Harare", is_primary: true },
      { slug: "bulawayo", name: "Bulawayo", is_primary: false },
    ],
    work_mode: null,
    employment_type: "full_time",
    deadline: { at: FUTURE, timezone: "Africa/Harare", is_date_only: true, state: "open" },
    salary: null,
    salary_text: "Competitive",
    verification: { level: "source_checked", checked_at: "2026-10-30T08:00:00Z" },
    primary_source_name: "herald.co.zw",
    status: "published",
    published_at: "2026-10-30T08:00:00Z",
    is_saved: null,
    description_html: "<ul><li>Prepare the monthly accounts</li><li>Reconcile bank statements</li></ul>",
    requirements_html: "<ul><li>ACCA part-qualified</li></ul>",
    geographic_eligibility: null,
    location_text: null,
    experience_level: null,
    funding: null,
    skills: [],
    sectors: [],
    reference_number: null,
    contact_details: null,
    application: {
      method: "external_url",
      url: "https://water.example.org/apply",
      email: null,
      email_subject: null,
      instructions: null,
    },
    sources: [
      {
        kind: "newspaper",
        name: "herald.co.zw",
        url: "https://www.herald.co.zw/jobs/1",
        citation: null,
        observed_on: "2026-10-30",
        is_primary: true,
      },
    ],
    detail: { vacancies: 2 },
    detail_schema_version: 1,
    canonical_path: "/opportunities/senior-accountant-k7m3qp",
    updated_at: "2026-10-30T08:00:00Z",
    ...over,
  };
}

const links = () => screen.queryAllByRole("link");
const text = () => document.body.textContent ?? "";

describe("the order of the page", () => {
  it("runs title, organisation and status, facts, apply, overview, responsibilities, qualifications, how to apply, source", () => {
    render(<JobView listing={listing()} />);
    const order = [
      screen.getByRole("heading", { level: 1, name: "Senior Accountant" }),
      screen.getByRole("link", { name: /Apply Now/ }),
      screen.getByText("Lead the finance team of a water authority."),
      screen.getByRole("heading", { name: "Key responsibilities" }),
      screen.getByRole("heading", { name: "Qualifications & experience" }),
      screen.getByRole("heading", { name: "How to apply" }),
      screen.getByRole("heading", { name: "Where this came from" }),
    ];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(screen.getByText("Source checked")).toBeInTheDocument(); // the genuine status, next to the organisation
    expect(screen.queryByRole("img")).toBeNull(); // no logo, no featured image, none made up
  });

  it("shows each fact once and only the facts it has", () => {
    render(<JobView listing={listing()} />);
    expect(screen.getAllByText(/Harare/)).toHaveLength(1);
    expect(screen.getAllByText(/Closes /)).toHaveLength(1);
    expect(text()).toContain("Competitive");
    expect(text()).toContain("Full time");
    expect(text()).toContain("2 vacancies");
    expect(text()).toContain("Harare, Bulawayo");
  });

  it("omits what the source did not give, without placeholders", () => {
    render(
      <JobView
        listing={listing({
          summary: "",
          salary_text: null,
          requirements_html: null,
          employment_type: null,
          detail: {},
          deadline: { at: null, timezone: null, is_date_only: false, state: "unknown" },
        })}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Qualifications & experience" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "More details" })).toBeNull();
    expect(text()).not.toMatch(/undefined|\bnull\b|vacanc/i);
    expect(text()).toContain("Deadline not stated");
  });

  it("calls the body of a non-job category by its own name", () => {
    render(<JobView listing={listing({ category: { code: "tenders", name: "Tenders" } })} />);
    expect(screen.getByRole("heading", { name: "About this opportunity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
  });

  it("prints an amount in preference to wording", () => {
    expect(
      salaryLine({
        salary: { min: "700.00", max: "900.00", currency: "USD", period: "month" },
        salary_text: "x",
      }),
    ).toBe("USD 700 – 900 per month");
    expect(salaryLine({ salary: null, salary_text: " Negotiable " })).toBe("Negotiable");
    expect(salaryLine({ salary: null, salary_text: null })).toBeNull();
  });
});

describe("the apply actions", () => {
  it("opens the genuine website in a new tab and says that you leave UPNEXT", () => {
    render(<JobView listing={listing()} />);
    const apply = within(screen.getByTestId("apply"));
    const link = apply.getByRole("link", { name: /Apply Now/ });
    expect(link).toHaveAttribute("href", "https://water.example.org/apply");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    expect(link.hasAttribute("data-listing-apply")).toBe(true);
    expect(screen.getByTestId("apply").textContent).toContain("You will leave UPNEXT");
    expect(screen.getByTestId("apply").textContent).toContain("does not receive or track applications");
  });

  it("opens the e-mail client with the recipient and the subject, encoded", () => {
    render(
      <JobView
        listing={listing({
          application: {
            method: "email",
            url: null,
            email: "jobs@water.example.org",
            email_subject: "Application: Senior Accountant & more",
            instructions: null,
          },
        })}
      />,
    );
    const mail = screen.getAllByRole("link", { name: "Apply via Email" })[0]!;
    expect(mail.getAttribute("href")).toBe(
      "mailto:jobs@water.example.org?subject=Application%3A%20Senior%20Accountant%20%26%20more",
    );
    expect(screen.queryByRole("link", { name: /Apply Now/ })).toBeNull();
    expect(mailtoHref("a@b.example")).toBe("mailto:a@b.example"); // no subject: no query
  });

  it("offers both actions when there are both, each with its own destination", () => {
    render(
      <JobView
        listing={listing({
          application: {
            method: "both",
            url: "https://water.example.org/apply",
            email: "jobs@water.example.org",
            email_subject: null,
            instructions: null,
          },
        })}
      />,
    );
    const apply = within(screen.getByTestId("apply"));
    expect(apply.getByRole("link", { name: /Apply Now/ })).toHaveAttribute(
      "href",
      "https://water.example.org/apply",
    );
    expect(apply.getByRole("link", { name: "Apply via Email" })).toHaveAttribute(
      "href",
      "mailto:jobs@water.example.org",
    );
  });

  it("invents no destination for instructions only", () => {
    render(
      <JobView
        listing={listing({
          application: {
            method: "instructions",
            url: null,
            email: null,
            instructions: "Hand deliver your CV to reception before 4pm.",
          },
        })}
      />,
    );
    const view = screen.getByRole("link", { name: "View Application Instructions" });
    expect(view).toHaveAttribute("href", "#how-to-apply");
    expect(
      links().filter(
        (l) =>
          /^(https?:|mailto:)/.test(l.getAttribute("href") ?? "") && !l.closest("[aria-label='Sources']"),
      ),
    ).toHaveLength(0);
    expect(screen.getByText("Hand deliver your CV to reception before 4pm.")).toBeInTheDocument();
  });

  it("never turns the source link into the apply button", () => {
    render(
      <JobView
        listing={listing({
          application: { method: "external_url", url: null, email: null, instructions: null },
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: /Apply Now/ })).toBeNull();
    expect(screen.queryByTestId("apply")).toBeNull(); // no destination: no apply block, the source stays under Sources
  });

  it("refuses a non-https application address", () => {
    render(
      <JobView
        listing={listing({
          application: {
            method: "external_url",
            url: "http://insecure.example.org/a",
            email: null,
            instructions: null,
          },
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: /Apply Now/ })).toBeNull();
  });
});

describe("closed opportunities", () => {
  it.each([
    ["expired", "Closed"],
    ["withdrawn", "Withdrawn by the issuer"],
  ] as const)("a %s listing says so and offers no application", (status, label) => {
    render(<JobView listing={listing({ status })} />);
    expect(screen.getByTestId("status-banner").textContent).toContain(label);
    expect(screen.queryByRole("link", { name: /Apply Now|Apply via Email/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "How to apply" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument(); // still readable, so shared links keep working
  });

  it("treats a published listing whose closing date has passed as closed", () => {
    render(
      <JobView
        listing={listing({
          deadline: {
            at: "2026-01-01T21:59:59Z",
            timezone: "Africa/Harare",
            is_date_only: true,
            state: "expired",
          },
        })}
      />,
    );
    expect(screen.getByTestId("status-banner")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Apply Now/ })).toBeNull();
  });
});

describe("share and the sticky bar", () => {
  it("uses the device's share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    render(<ShareButton title="Senior Accountant" path="/opportunities/x" />);
    fireEvent.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Senior Accountant",
        url: `${window.location.origin}/opportunities/x`,
      }),
    );
    expect(await screen.findByText("Shared.")).toBeInTheDocument();
  });

  it("copies the address when there is no share sheet, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ShareButton title="Senior Accountant" path="/opportunities/x" />);
    fireEvent.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/opportunities/x`));
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });

  it("stays silent when the person closes the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("closed"), { name: "AbortError" }));
    vi.stubGlobal("navigator", { share });
    render(<ShareButton title="T" path="/opportunities/x" />);
    fireEvent.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("keeps the bottom Apply bar hidden until the main button has scrolled away, above the tab bar", () => {
    const { container } = render(
      <StickyApply targetId="nope">
        <a href="#x">Apply Now</a>
      </StickyApply>,
    );
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("bottom-[58px]");
    expect(bar.className).toContain("invisible");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
  });
});
