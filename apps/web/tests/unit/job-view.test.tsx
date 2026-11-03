import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { JobView } from "@/components/opportunities/job-view";
import { ShareButton } from "@/components/opportunities/share-button";
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
  it("runs title, organisation and status, facts, apply, overview, responsibilities, qualifications, how to apply, report link", () => {
    render(<JobView listing={listing()} />);
    const order = [
      screen.getByRole("heading", { level: 1, name: "Senior Accountant" }),
      screen.getByRole("link", { name: /Apply Now/ }),
      screen.getByRole("heading", { name: "Overview" }),
      screen.getByText("Lead the finance team of a water authority."),
      screen.getByRole("heading", { name: "Key responsibilities" }),
      screen.getByRole("heading", { name: "Qualifications & experience" }),
      screen.getByRole("heading", { name: "How to apply" }),
      screen.getByRole("link", { name: "Report this opportunity" }),
    ];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(screen.getByText("Source checked")).toBeInTheDocument(); // the genuine status, next to the organisation
    expect(screen.queryByRole("img")).toBeNull(); // no logo, no featured image, none made up
  });

  it("states the verification level only as its label, with no sources block", () => {
    render(<JobView listing={listing()} />);
    expect(screen.getAllByText("Source checked")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Where this came from" })).toBeNull();
    expect(screen.queryByLabelText("Sources")).toBeNull();
    expect(text()).not.toMatch(/Last checked|not confirmation from the issuing organisation|\(primary\)/i);
    expect(text()).not.toContain("herald.co.zw");
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

  it("shows Pay: TBA when no pay was typed, for a category that has pay, and nothing for one that has none", () => {
    const { unmount } = render(<JobView listing={listing({ salary_text: null })} />);
    expect(text()).toContain("Pay: TBA");
    unmount();
    render(
      <JobView listing={listing({ salary_text: null, category: { code: "tenders", name: "Tenders" } })} />,
    );
    expect(text()).not.toContain("TBA");
  });

  it("does not show the details the owner retired, even when an older listing stored them", () => {
    render(
      <JobView
        listing={listing({
          experience_level: "senior",
          detail: {
            vacancies: 2,
            benefits: ["Medical aid"],
            minimum_qualification: "diploma",
            minimum_experience_years: 3,
            professional_registration: ["ZICA"],
            languages_required: ["en"],
            driving_licence_required: true,
            contract_duration_months: 12,
          },
        })}
      />,
    );
    const details = screen.getByTestId("category-details");
    expect(details).toHaveTextContent("Contract duration months");
    for (const gone of [
      "Benefits",
      "Minimum qualification",
      "Minimum experience years",
      "Professional registration",
      "Languages required",
      "Driving licence required",
      "Experience level",
    ])
      expect(details).not.toHaveTextContent(gone);
  });

  it("falls back to the location as written when no structured place is attached", () => {
    render(<JobView listing={listing({ locations: [], location_text: "Harare CBD" })} />);
    expect(text()).toContain("Harare CBD");
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
    expect(links().filter((l) => /^(https?:|mailto:)/.test(l.getAttribute("href") ?? ""))).toHaveLength(0);
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
    expect(screen.queryByTestId("apply")).toBeNull(); // no destination: no apply block, and no source is shown
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

describe("share", () => {
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
});

describe("the mobile layout (owner reference, D-63)", () => {
  const instructionsOnly = (over: Partial<OpportunityDetail> = {}) =>
    listing({
      application: {
        method: "instructions",
        url: null,
        email: null,
        email_subject: null,
        instructions: "Applications should be addressed to:\nDirector Transmission/A\nBox 1760, Harare",
      },
      reference_number: "115/1/TM/nm",
      ...over,
    });

  it("shows facts as two rows of chips: place, type, arrangement, then pay and the closing date", () => {
    const { container } = render(
      <JobView listing={listing({ employment_type: "contract", work_mode: "on_site" })} />,
    );
    const rows = container.querySelectorAll("article > ul");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toMatch(/Harare, Bulawayo.*Contract.*On site/);
    expect(rows[1]!.textContent).toMatch(/Competitive.*Closes/);
  });

  it("draws no chip for a fact the listing does not have", () => {
    const { container } = render(
      <JobView
        listing={listing({ employment_type: null, work_mode: null, locations: [], location_text: null })}
      />,
    );
    expect(container.querySelectorAll("article > ul")).toHaveLength(1); // only the pay and deadline row
    expect(text()).not.toMatch(/Contract|Permanent|On site|Hybrid|Remote/);
  });

  it("shows the verified badge only for a verified listing, and a plain label otherwise", () => {
    const { unmount } = render(
      <JobView listing={listing({ verification: { level: "issuer_verified", checked_at: null } })} />,
    );
    expect(screen.getByTestId("verified-badge")).toHaveTextContent("Verified");
    unmount();
    render(<JobView listing={listing({ verification: { level: "not_verified", checked_at: null } })} />);
    expect(screen.queryByTestId("verified-badge")).toBeNull();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
  });

  it("an instructions-only listing gets one button that jumps to How to apply, and the instructions appear once", () => {
    render(<JobView listing={instructionsOnly()} />);
    const button = screen.getByRole("link", { name: /View Application Instructions/ });
    expect(button).toHaveAttribute("href", "#how-to-apply");
    expect(document.getElementById("how-to-apply")).not.toBeNull();
    expect(screen.getAllByText(/Director Transmission\/A/)).toHaveLength(1);
    expect(screen.getByText(/Reference: 115\/1\/TM\/nm/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Apply Now|Apply via Email/ })).toBeNull();
  });

  it("does not repeat an address, e-mail or reference the instructions already state", () => {
    render(
      <JobView
        listing={listing({
          application: {
            method: "both",
            url: "https://careers.example.org/apply",
            email: "hr@example.org",
            email_subject: null,
            instructions: "Apply at careers.example.org or write to hr@example.org quoting REF-9.",
          },
          reference_number: "REF-9",
          contact_details: null,
        })}
      />,
    );
    const how = document.getElementById("how-to-apply")!;
    expect(how.textContent).not.toMatch(/Send your application to/);
    expect(how.textContent).not.toMatch(/Apply on careers/);
    expect(how.textContent).not.toMatch(/Reference: REF-9/);
    expect(how.textContent).toContain("hr@example.org"); // once, in the instructions
  });

  it("shows the safety notice once, and no sticky second Apply bar", () => {
    const { container } = render(<JobView listing={listing()} />);
    expect(screen.getAllByText(/Never pay to apply/)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "how to apply safely" })).toHaveAttribute(
      "href",
      "/guides/apply-safely-and-avoid-scams",
    );
    expect(container.querySelector(".fixed")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Apply Now/ })).toHaveLength(1);
  });

  it("drops a heading the section already carries, so Responsibilities is not printed twice", () => {
    render(
      <JobView
        listing={listing({
          description_html: "<h3>Responsibilities</h3><ul><li>Run the ledger</li></ul>",
          requirements_html: "<h3>Qualifications &amp; experience</h3><ul><li>CA(Z)</li></ul>",
        })}
      />,
    );
    expect(screen.getAllByRole("heading", { name: "Key responsibilities" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Responsibilities" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Qualifications & experience" })).toHaveLength(1);
    expect(screen.getByText("Run the ledger")).toBeInTheDocument();
  });

  it("puts Save and Share side by side as one pair, and Share is a block button", () => {
    render(<JobView listing={listing()} personal={<button>Save</button>} />);
    const share = screen.getByRole("button", { name: /Share/ });
    expect(share.className).toContain("w-full");
    expect(share.parentElement!.parentElement!.className).toContain("grid-cols-2");
  });

  it("marks the page so the phone header can turn navy, and keeps the report link", () => {
    const { container } = render(<JobView listing={listing()} />);
    expect(container.querySelector("[data-job-page]")).not.toBeNull();
    expect(screen.getByTestId("report-link")).toBeInTheDocument();
  });
});

describe("related opportunity cards", () => {
  it("show the mark, title, organisation, place, type and closing date, and link to the listing", async () => {
    const { RelatedCard } = await import("@/components/opportunities/job-parts");
    const row = {
      ...listing(),
      title: "Stock Controllers (3 Posts) - Grade G",
      organisation: { id: "o2", name: "Delta Beverages" },
      locations: [{ slug: "harare", name: "Harare", is_primary: true }],
      employment_type: "permanent",
    };
    render(
      <ul>
        <RelatedCard row={row} />
      </ul>,
    );
    const link = screen.getByRole("link", { name: /Stock Controllers/ });
    expect(link).toHaveAttribute("href", `/opportunities/${row.slug}`);
    for (const t of ["Delta Beverages", "Harare", "Permanent", "DB"]) expect(link.textContent).toContain(t);
    expect(link.textContent).toMatch(/Closes/);
  });
});

describe("publication and update dates", () => {
  it("shows when the listing was posted and, if different, when it was last updated, as machine-readable times", () => {
    render(<JobView listing={listing({ updated_at: "2026-11-02T08:00:00Z" })} />);
    const dates = screen.getByTestId("listing-dates");
    expect(dates.textContent).toBe("Posted 30 Oct 2026 · Updated 2 Nov 2026.");
    const times = dates.querySelectorAll("time");
    expect(times[0]!.getAttribute("datetime")).toBe("2026-10-30T08:00:00Z");
    expect(times[1]!.getAttribute("datetime")).toBe("2026-11-02T08:00:00Z");
  });
  it("shows one date when the listing has not changed since it was posted", () => {
    render(<JobView listing={listing()} />);
    expect(screen.getByTestId("listing-dates").textContent).toBe("Posted 30 Oct 2026.");
  });
  it("is left out of a staff preview", () => {
    render(<JobView listing={listing()} preview />);
    expect(screen.queryByTestId("listing-dates")).toBeNull();
  });
});
