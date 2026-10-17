import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OpportunityRow } from "@/components/opportunities/parts";
import { ListingRow } from "@/components/ui";
import type { OpportunitySummary } from "@/lib/catalog-types";
import {
  deadlineView,
  domainOf,
  formatDate,
  formatMoney,
  humanise,
  labelFor,
  locationLabel,
  verificationTone,
} from "@/lib/format";
import { SafeHtml, buildTree, decodeEntities, tokenise } from "@/lib/safe-html";

const row: OpportunitySummary = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "graduate-electrical-engineer-abc123",
  title: "Graduate Electrical Engineer",
  summary: "Support distribution projects.",
  category: { code: "jobs", name: "Jobs" },
  organisation: { id: "00000000-0000-4000-8000-0000000000aa", name: "Example Power Services" },
  locations: [
    { slug: "harare", name: "Harare", is_primary: true },
    { slug: "mutare", name: "Mutare", is_primary: false },
  ],
  work_mode: "on_site",
  employment_type: "permanent",
  deadline: { at: "2026-11-27T14:30:00Z", timezone: "Africa/Harare", is_date_only: false, state: "open" },
  salary: { min: "700.00", max: "900.00", currency: "USD", period: "month" },
  verification: { level: "not_verified", checked_at: null },
  primary_source_name: "Example Power Services careers page",
  status: "published",
  published_at: "2026-10-12T08:00:00Z",
  is_saved: null,
};

describe("formatting never invents facts", () => {
  it("shows money as currency, range and period without converting", () => {
    expect(formatMoney(row.salary)).toBe("USD 700 – 900 per month");
    expect(formatMoney({ min: "5000", max: null, currency: "ZWG", period: "year" })).toBe(
      "ZWG from 5,000 per year",
    );
    expect(formatMoney({ min: null, max: "20.50", currency: "USD", period: null })).toBe("USD up to 20.5");
    expect(formatMoney({ min: "10", max: "10", currency: "USD", period: "once" })).toBe("USD 10 one-off");
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney({ min: null, max: null, currency: "USD", period: null })).toBeNull();
  });

  it("words deadlines from the API state and the listing's own time zone", () => {
    expect(deadlineView(row.deadline)).toEqual({ label: "Closes 27 Nov 2026, 16:30", tone: "good" });
    expect(deadlineView({ ...row.deadline, state: "closing_soon" }).tone).toBe("urgent");
    expect(deadlineView({ ...row.deadline, state: "expired" }).label).toMatch(/^Closed 27 Nov 2026/);
    expect(deadlineView({ at: null, timezone: null, is_date_only: false, state: "unknown" })).toEqual({
      label: "Deadline not stated",
      tone: "default",
    });
    expect(deadlineView({ ...row.deadline, is_date_only: true }).label).toBe("Closes 27 Nov 2026");
    expect(deadlineView(row.deadline, "withdrawn").label).toBe("Withdrawn by the issuer");
    expect(
      deadlineView({ at: null, timezone: null, is_date_only: false, state: "unknown" }, "expired").label,
    ).toBe("Closed");
  });

  it("falls back to UTC for an unknown time zone and labels enums as words", () => {
    expect(formatDate("2026-11-27T22:30:00Z", "Not/AZone")).toBe("27 Nov 2026");
    expect(labelFor("part_time")).toBe("Part time");
    expect(labelFor("custom_value")).toBe("Custom value");
    expect(labelFor(null)).toBeNull();
    expect(humanise("minimum_experience_years")).toBe("Minimum experience years");
    expect(locationLabel(row)).toBe("Harare +1");
    expect(domainOf("https://careers.example.org/a")).toBe("careers.example.org");
    expect(domainOf("not a url")).toBe("not a url");
  });
});

describe("OpportunityRow", () => {
  it("links to the detail page and states what is and is not known", () => {
    render(<OpportunityRow row={row} />);
    expect(screen.getByRole("link", { name: "Graduate Electrical Engineer" })).toHaveAttribute(
      "href",
      "/opportunities/graduate-electrical-engineer-abc123",
    );
    expect(
      screen.getByRole("link", { name: "View details for Graduate Electrical Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getByText("Source: Example Power Services careers page")).toBeInTheDocument();
    expect(screen.getByText("USD 700 – 900 per month")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull(); // no inert control before accounts exist
  });

  it("does not render a save control unless saving is supported", () => {
    render(<ListingRow organisation="Org" title="A title" href="/x" facts={[]} saved={false} />);
    expect(screen.getByRole("button", { name: "Save A title" })).toBeInTheDocument();
  });
});

describe("SafeHtml", () => {
  it("renders the allowed subset as elements", () => {
    const { container } = render(
      <SafeHtml html='<p>Hello <strong>bold</strong> &amp; <em>em</em><br>next</p><ul><li>one</li></ul><a href="https://example.org/a">link</a>' />,
    );
    expect(container.querySelector("p strong")?.textContent).toBe("bold");
    expect(container.textContent).toContain("Hello bold & emnext");
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.org/a");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<p onclick="alert(1)">x</p>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="http://insecure.example.org">x</a>',
    '<iframe src="https://evil.example"></iframe>',
    "<svg onload=alert(1)>",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  ])("never produces active content from %s", (payload) => {
    const { container } = render(<SafeHtml html={payload} />);
    expect(container.querySelector("script,img,iframe,svg,object,embed")).toBeNull();
    for (const el of container.querySelectorAll("*")) {
      for (const attr of el.getAttributeNames()) {
        expect(["href", "rel", "target", "class"]).toContain(attr);
      }
      if (el.tagName === "A") expect(el.getAttribute("href") ?? "").toMatch(/^https:\/\//);
    }
  });

  it("repairs unbalanced input and decodes entities", () => {
    const { container } = render(<SafeHtml html="<p>one<strong>two</p></li>three" />);
    expect(container.textContent).toBe("onetwothree");
    expect(decodeEntities("&lt;&amp;&#x27;&quot;")).toBe("<&'\"");
    expect(tokenise("a<br>b")).toHaveLength(3);
    expect(buildTree(tokenise("<p>x</p>"))).toHaveLength(1);
  });
});

describe("verification wording", () => {
  it("keeps source-checked visually distinct from verified with the issuer", () => {
    expect(verificationTone("issuer_verified")).toBe("good");
    expect(verificationTone("source_checked")).toBe("default");
    expect(verificationTone("not_verified")).toBe("default");
  });
});
