import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    render(<JobView listing={listing({ detail: { vacancies: 2, contract_duration_months: 12 } })} />);
    const order = [
      screen.getByRole("heading", { level: 1, name: "Senior Accountant" }),
      screen.getByRole("link", { name: /Apply Now/ }),
      screen.getByRole("heading", { name: "Overview" }),
      screen.getByText("Lead the finance team of a water authority."),
      screen.getByRole("heading", { name: "Key responsibilities" }),
      screen.getByRole("heading", { name: "Qualifications & experience" }),
      screen.getByRole("heading", { name: "How to apply" }),
      screen.getByRole("heading", { name: "More details" }),
      screen.getByRole("link", { name: "Report this opportunity" }),
    ];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(screen.getByText("Source checked")).toBeInTheDocument(); // the genuine status, next to the organisation
    expect(screen.queryByRole("img")).toBeNull(); // no logo, no featured image, none made up
  });

  it("shows the label beside the organisation and explains it once in About this listing (D-74)", () => {
    render(<JobView listing={listing()} />);
    expect(screen.getAllByText("Source checked")).toHaveLength(1); // the tag; the record says "Source checked."
    expect(screen.queryByRole("heading", { name: "Where this came from" })).toBeNull();
    expect(screen.queryByLabelText("Sources")).toBeNull();
    const record = screen.getByTestId("listing-verification");
    expect(record).toHaveTextContent("not confirmation from the issuing organisation");
    expect(within(record).getByRole("link", { name: "What the labels mean" })).toHaveAttribute(
      "href",
      "/guides/how-listings-are-verified",
    );
    expect(text()).not.toMatch(/\(primary\)/i);
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
    expect(text()).not.toMatch(/Deadline not stated|Not stated|TBA/);
  });

  it("never prints a pay placeholder: no pay typed means no pay chip, in any category", () => {
    const { unmount } = render(<JobView listing={listing({ salary_text: null })} />);
    expect(text()).not.toMatch(/Pay:|TBA/);
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
          sources: [], // the recorded source link (D-74) is not an application destination
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

describe("share as an icon", () => {
  it("is icon-only with a name and tooltip, and says the outcome in a note that then clears", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ShareButton title="T" path="/opportunities/x" icon />);
    const button = screen.getByRole("button", { name: "Share this opportunity" });
    expect(button.textContent).toBe("");
    expect(button).toHaveAttribute("title", "Share");
    fireEvent.click(button);
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200);
    });
    expect(screen.getByRole("status").textContent).toBe("");
    vi.useRealTimers();
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

describe("Apply Now, Save and Share on one line", () => {
  const SaveStub = () => (
    <button type="button" aria-label="Save Senior Accountant">
      s
    </button>
  );

  it("puts the three controls in one non-wrapping row: Apply Now first, then Save, then Share", () => {
    render(<JobView listing={listing()} personal={<SaveStub />} />);
    const row = screen.getByTestId("action-row");
    expect(row.className).toContain("flex");
    expect(row.className).not.toMatch(/flex-wrap|grid/);
    const [apply, save, share] = Array.from(row.children) as [HTMLElement, HTMLElement, HTMLElement];
    expect(apply).toHaveTextContent("Apply Now");
    expect(save).toHaveAttribute("aria-label", "Save Senior Accountant");
    expect(share).toHaveAttribute("aria-label", "Share this opportunity");
    expect(apply.className).toContain("flex-1"); // it takes the remaining width
  });

  it("makes Save and Share icon-only squares with names and tooltips, and the same height as Apply", () => {
    render(<JobView listing={listing()} personal={<SaveStub />} />);
    const share = screen.getByRole("button", { name: "Share this opportunity" });
    expect(share.textContent).toBe(""); // no visible text
    expect(share).toHaveAttribute("title", "Share");
    expect(share.className).toMatch(/w-10/);
    expect(share.className).toMatch(/self-stretch/); // as tall as Apply Now, whatever its height
    expect(share.className).toMatch(/min-h-field/); // a 40px target
    expect(screen.getByRole("link", { name: /Apply Now/ }).className).toMatch(/min-h-field/);
    expect(share.querySelector("svg")).not.toBeNull();
  });

  it("keeps the second destination on its own line beneath, so nothing is lost", () => {
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
    const row = screen.getByTestId("action-row");
    expect(within(row).getByRole("link", { name: /Apply Now/ })).toBeInTheDocument();
    expect(within(row).queryByRole("link", { name: "Apply via Email" })).toBeNull();
    expect(screen.getByRole("link", { name: "Apply via Email" })).toHaveAttribute(
      "href",
      "mailto:jobs@water.example.org",
    );
  });

  it("an e-mail-only listing puts Apply via Email in the row", () => {
    render(
      <JobView
        listing={listing({
          application: {
            method: "email",
            url: null,
            email: "jobs@water.example.org",
            email_subject: null,
            instructions: null,
          },
        })}
      />,
    );
    expect(
      within(screen.getByTestId("action-row")).getByRole("link", { name: "Apply via Email" }),
    ).toBeVisible();
  });

  it("a closed listing offers Save and Share, and no Apply", () => {
    render(<JobView listing={listing({ status: "expired" })} personal={<SaveStub />} />);
    const row = screen.getByTestId("action-row");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).getAllByRole("button")).toHaveLength(2);
  });

  it("a preview offers Apply alone: no Save, no Share", () => {
    render(<JobView listing={listing()} preview />);
    const row = screen.getByTestId("action-row");
    expect(row.children).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Share/ })).toBeNull();
  });
});

describe("the order of sections", () => {
  it("puts How to apply straight after Qualifications & experience, then More details", () => {
    render(<JobView listing={listing({ detail: { vacancies: 2, contract_duration_months: 12 } })} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Overview",
      "Key responsibilities",
      "Qualifications & experience",
      "How to apply",
      "More details",
      "About this listing", // D-74: always last, before the report link
    ]);
  });

  it("keeps the order when a section is absent: How to apply still follows the last body section", () => {
    render(
      <JobView listing={listing({ requirements_html: null, detail: { contract_duration_months: 12 } })} />,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Overview",
      "Key responsibilities",
      "How to apply",
      "More details",
      "About this listing",
    ]);
  });

  it("leaves the application link and the page's content as they were", () => {
    render(<JobView listing={listing()} />);
    const how = document.getElementById("how-to-apply")!;
    expect(how.textContent).toContain("Never pay to apply");
    expect(screen.getByRole("link", { name: /Apply Now/ })).toHaveAttribute(
      "href",
      "https://water.example.org/apply",
    );
  });
});

describe("the featured image", () => {
  const image = { featured: "https://upnext.co.zw/media/listings/x.jpg", social: null, alt: "Our office" };

  it("is a compact box: 160px high on a phone, 200px from the tablet width, in the picture's proportions", () => {
    render(<JobView listing={listing({ image })} />);
    const open = screen.getByRole("button", { name: /View full image/ });
    expect(open.className).toMatch(/h-\[160px\]/);
    expect(open.className).toMatch(/sm:h-\[200px\]/);
    expect(open.className).toMatch(/aspect-video/); // 16:9, so a 16:9 picture fills it exactly
    const shown = within(open).getByRole("img", { name: "Our office" });
    expect(shown.className).toMatch(/object-contain/); // never stretched, never cropped
    expect(shown.className).not.toMatch(/object-cover/);
    expect(shown).toHaveAttribute("src", image.featured);
  });

  it("opens the whole picture in a modal viewer when tapped, and closes it", () => {
    const showModal = vi.fn();
    const close = vi.fn();
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
    render(<JobView listing={listing({ image })} />);
    fireEvent.click(screen.getByRole("button", { name: /View full image/ }));
    expect(showModal).toHaveBeenCalledTimes(1);
    const viewer = screen.getByTestId("image-viewer");
    expect(viewer.tagName).toBe("DIALOG");
    expect(viewer.querySelector("img")).toHaveAttribute("src", image.featured);
    fireEvent.click(viewer.querySelector("button[aria-label='Close image']")!);
    expect(close).toHaveBeenCalled();
    fireEvent.click(viewer); // the backdrop
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("draws nothing without a picture", () => {
    render(<JobView listing={listing({ image: null })} />);
    expect(screen.queryByTestId("featured-image")).toBeNull();
  });
});

describe("optional details that were not entered are not shown", () => {
  const bare = () =>
    listing({
      salary_text: null,
      salary: null,
      funding: null,
      deadline: { at: null, timezone: null, is_date_only: false, state: "unknown" },
      reference_number: " ",
      contact_details: "",
      work_mode: null,
      employment_type: null,
      locations: [],
      location_text: null,
      summary: "",
      skills: [],
      detail: {
        vacancies: 0,
        notes: "",
        languages: [],
        extra: null,
        nested: { a: "", b: null },
        empty_text: "   ",
      },
      application: {
        method: "external_url",
        url: "https://water.example.org/apply",
        email: null,
        email_subject: null,
        instructions: "  ",
      },
    });

  it("hides every empty label, badge and placeholder", () => {
    const { container } = render(<JobView listing={bare()} />);
    expect(container.querySelectorAll("article > ul")).toHaveLength(0); // not even an empty row of chips
    expect(screen.queryByRole("heading", { name: "More details" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull();
    expect(text()).not.toMatch(
      /Pay:|TBA|Not stated|Deadline|Closes|vacanc|Reference|Contact|undefined|\bnull\b|Funding/i,
    );
    expect(document.getElementById("how-to-apply")!.textContent).not.toMatch(/Reference|Contact/);
  });

  it("shows each optional detail as soon as it has a value", () => {
    render(
      <JobView
        listing={listing({
          salary_text: "US$450 per month",
          reference_number: "REF-12",
          contact_details: "Ms Moyo, 0242 000 000",
          work_mode: "hybrid",
          detail: { vacancies: 3, shift: "Night" },
          application: {
            method: "instructions",
            url: null,
            email: null,
            email_subject: null,
            instructions: "Hand deliver your CV.",
          },
        })}
      />,
    );
    for (const shown of [
      "US$450 per month",
      "3 vacancies",
      "Hybrid",
      "Closes ",
      "Reference: REF-12",
      "Contact: Ms Moyo",
      "Night",
    ])
      expect(text()).toContain(shown);
  });

  it("lists only the filled entries of a nested detail", () => {
    render(<JobView listing={listing({ detail: { vacancies: 1, contacts: { phone: "0242", fax: "" } } })} />);
    const details = screen.getByTestId("category-details");
    expect(details).toHaveTextContent("Phone");
    expect(details).not.toHaveTextContent("Fax");
  });
});

describe("the instructions keep their formatting", () => {
  const instructions = {
    method: "instructions" as const,
    url: null,
    email: null,
    email_subject: null,
    instructions: "Apply at our site",
    instructions_html:
      '<p>Apply at <a href="https://careers.example.org/apply" rel="noopener noreferrer nofollow ugc" target="_blank">our <u>site</u></a>:</p><ol><li><strong>CV</strong></li><li>Letter</li></ol>',
  };

  it("renders bold, underline, lists and links from the API's HTML", () => {
    render(<JobView listing={listing({ application: instructions })} />);
    const how = within(screen.getByTestId("instructions"));
    expect(how.getByRole("link", { name: "our site" })).toHaveAttribute(
      "href",
      "https://careers.example.org/apply",
    );
    expect(how.getByRole("list").tagName).toBe("OL");
    expect(how.getByText("CV").tagName).toBe("STRONG");
    expect(document.querySelector("#how-to-apply u")).not.toBeNull();
  });

  it("shows a published link in blue and underlined, opening in a new tab", () => {
    render(<JobView listing={listing({ application: instructions })} />);
    const link = screen.getByRole("link", { name: "our site" });
    expect(link.className).toContain("text-link");
    expect(link.className).toContain("underline");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
  });

  it("falls back to the plain text, line breaks kept, for an older listing or API", () => {
    render(
      <JobView
        listing={listing({
          application: { ...instructions, instructions: "Line one\nLine two", instructions_html: undefined },
        })}
      />,
    );
    expect(screen.getByText(/Line one/).className).toContain("whitespace-pre-line");
  });

  it("never turns a non-https or script link into a link", () => {
    render(
      <JobView
        listing={listing({
          description_html:
            '<p><a href="javascript:alert(1)">bad</a> <a href="http://example.org">http</a> <script>alert(1)</script></p>',
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.queryByRole("link", { name: "http" })).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("title size and the desktop side column", () => {
  it("sets the title at the size of the section headings, not larger", () => {
    render(<JobView listing={listing()} />);
    const title = screen.getByRole("heading", { level: 1 });
    const section = screen.getByRole("heading", { name: "Overview" });
    const size = (el: HTMLElement) => el.className.match(/text-(?:title|sub|\[\d+px\]|section)/)?.[0];
    expect(size(title)).toBe("text-title");
    expect(size(title)).toBe(size(section));
    expect(title.className).not.toMatch(/text-\[30px\]|text-sub|font-headline/);
  });

  it("puts the related opportunities in a column beside the listing from the desktop width", () => {
    render(<JobView listing={listing()} related={<section aria-label="Related">related</section>} />);
    const page = document.querySelector("[data-job-page]")!;
    expect(page.className).toMatch(/md:grid/);
    expect(page.className).toMatch(/md:grid-cols-\[minmax\(0,1fr\)_320px\]/);
    const main = screen.getByTestId("job-main");
    const aside = screen.getByTestId("job-aside");
    expect(main.parentElement).toBe(page);
    expect(aside.parentElement).toBe(page);
    expect(aside).toHaveTextContent("related");
    expect(main.contains(aside)).toBe(false);
    // Phones and tablets: the column stacks, related after the listing.
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no side column without related listings", () => {
    render(<JobView listing={listing()} />);
    expect(screen.queryByTestId("job-aside")).toBeNull();
  });
});

describe("About this listing (AdSense audit 2026-11-14, D-74)", () => {
  it("shows the recorded original source with a safe link, once, after the details", () => {
    render(<JobView listing={listing()} />);
    const source = screen.getByTestId("listing-source");
    const link = within(source).getByRole("link", { name: "herald.co.zw" });
    expect(link).toHaveAttribute("href", "https://www.herald.co.zw/jobs/1");
    expect(link).toHaveAttribute("rel", "noopener nofollow");
    expect(source).toHaveTextContent("seen on 30 Oct 2026");
    expect(screen.getAllByText("herald.co.zw")).toHaveLength(1);
    const heading = screen.getByRole("heading", { name: "About this listing" });
    const report = screen.getByRole("link", { name: "Report this opportunity" });
    expect(heading.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no source line when none is recorded, and never a non-https link", () => {
    render(<JobView listing={listing({ sources: [] })} />);
    expect(screen.queryByTestId("listing-source")).toBeNull();
    expect(text()).not.toMatch(/Original source/);
    cleanup();
    render(
      <JobView
        listing={listing({
          sources: [
            {
              kind: "other",
              name: "Submitted by the employer through the UPNEXT employer portal",
              url: "http://insecure.example/x",
              citation: null,
              observed_on: "2026-11-06",
              is_primary: true,
            },
          ],
        })}
      />,
    );
    const source = screen.getByTestId("listing-source");
    expect(source).toHaveTextContent("Submitted by the employer through the UPNEXT employer portal");
    expect(within(source).queryByRole("link")).toBeNull();
  });

  it("states the publication date, and the update date only when it differs", () => {
    render(<JobView listing={listing()} />);
    const record = screen.getByTestId("listing-record");
    expect(record).toHaveTextContent("Published on UPNEXT30 Oct 2026");
    expect(record).not.toHaveTextContent("last updated");
    cleanup();
    render(<JobView listing={listing({ updated_at: "2026-11-07T10:00:00Z" })} />);
    expect(screen.getByTestId("listing-record")).toHaveTextContent("30 Oct 2026 · last updated 7 Nov 2026");
  });

  it("gives the check date for a verified listing and advice for an unverified one", () => {
    render(
      <JobView
        listing={listing({ verification: { level: "issuer_verified", checked_at: "2026-11-10T17:05:41Z" } })}
      />,
    );
    expect(screen.getByTestId("listing-verification")).toHaveTextContent("Checked on 10 Nov 2026.");
    cleanup();
    render(<JobView listing={listing({ verification: { level: "not_verified", checked_at: null } })} />);
    expect(screen.getByTestId("listing-verification")).toHaveTextContent(
      "Check it with the organisation before you apply.",
    );
  });

  it("notes a free webmail application address, and only then", () => {
    render(
      <JobView
        listing={listing({
          application: { method: "email", url: null, email: "Recruitment2026@Gmail.com", instructions: null },
        })}
      />,
    );
    expect(screen.getByTestId("webmail-note")).toHaveTextContent("go to a gmail.com address");
    cleanup();
    render(
      <JobView
        listing={listing({
          application: { method: "email", url: null, email: "jobs@probfix.co.zw", instructions: null },
        })}
      />,
    );
    expect(screen.queryByTestId("webmail-note")).toBeNull();
  });
});

describe("listing titles never repeat the brand", () => {
  it("drops a trailing UPNEXT or UPNEXT Careers that the layout would add again", async () => {
    const { withoutBrandSuffix } = await import("@/lib/brand");
    expect(withoutBrandSuffix("Leading Hand – Delta Beverages Harare | UPNEXT Careers")).toBe(
      "Leading Hand – Delta Beverages Harare",
    );
    expect(withoutBrandSuffix("PROBFIX Graduate Trainee Programme 2027/2028 | UPNEXT")).toBe(
      "PROBFIX Graduate Trainee Programme 2027/2028",
    );
    expect(withoutBrandSuffix("Accountant at Chabveka Solicitors")).toBe("Accountant at Chabveka Solicitors");
    expect(withoutBrandSuffix(null)).toBe("");
  });
});
