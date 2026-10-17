import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  ListingRow,
  Notice,
  SaveButton,
  SearchGroup,
  Select,
  Tabs,
  Tag,
  TextInput,
} from "@/components/ui";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins truthy class names only", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });
  it("uses accent tokens for primary and border tokens for secondary", () => {
    render(
      <>
        <Button>One</Button>
        <Button variant="secondary">Two</Button>
      </>,
    );
    expect(screen.getByText("One").className).toContain("bg-accent");
    expect(screen.getByText("Two").className).toContain("border-border-strong");
  });
  it("can be disabled", () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole("button", { name: "Off" })).toBeDisabled();
  });
});

describe("Field", () => {
  it("associates the visible label with the control", () => {
    render(
      <Field id="x" label="Full name">
        <TextInput id="x" />
      </Field>,
    );
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });
  it("shows an error that does not rely on colour and is announced", () => {
    render(
      <Field id="e" label="Email" error="Enter a valid address.">
        <TextInput id="e" invalid />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Error: Enter a valid address.");
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "e-error");
  });
  it("shows the hint only when there is no error", () => {
    const { rerender } = render(
      <Field id="h" label="Name" hint="As on your ID.">
        <TextInput id="h" />
      </Field>,
    );
    expect(screen.getByText("As on your ID.")).toBeInTheDocument();
    rerender(
      <Field id="h" label="Name" hint="As on your ID." error="Required.">
        <TextInput id="h" invalid />
      </Field>,
    );
    expect(screen.queryByText("As on your ID.")).not.toBeInTheDocument();
  });
  it("renders labelled selects and checkboxes with control-border tokens", () => {
    render(
      <>
        <Field id="s" label="Type">
          <Select id="s">
            <option>All</option>
          </Select>
        </Field>
        <Checkbox id="c" label="Source checked" />
      </>,
    );
    expect(screen.getByLabelText("Type").className).toContain("border-control-border");
    expect(screen.getByLabelText("Source checked")).toHaveAttribute("type", "checkbox");
  });
});

describe("SearchGroup", () => {
  it("is a search landmark whose controls have accessible names", () => {
    render(
      <SearchGroup aria-label="Search opportunities">
        <label htmlFor="q" className="sr-only">
          Keyword
        </label>
        <SearchGroup.Input id="q" />
        <label htmlFor="l" className="sr-only">
          Location
        </label>
        <SearchGroup.Select id="l">
          <option>All</option>
        </SearchGroup.Select>
        <Button size="search" type="submit">
          Find
        </Button>
      </SearchGroup>,
    );
    const group = screen.getByRole("search", { name: "Search opportunities" });
    expect(within(group).getByLabelText("Keyword")).toBeInTheDocument();
    expect(within(group).getByLabelText("Location")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Find" })).toHaveAttribute("type", "submit");
    expect(group.className).toContain("border-control-border");
  });
});

describe("Tabs", () => {
  it("marks the current tab with aria-current and labels the navigation", () => {
    render(
      <Tabs
        label="Categories"
        items={[
          { href: "#a", label: "All", current: true },
          { href: "#b", label: "Jobs" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Categories" });
    expect(within(nav).getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Jobs" })).not.toHaveAttribute("aria-current");
  });
});

describe("SaveButton", () => {
  it("exposes name and state programmatically and changes shape, not just colour", () => {
    const { rerender } = render(<SaveButton title="Graduate Engineer" saved={false} />);
    let button = screen.getByRole("button", { name: "Save Graduate Engineer" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("♡");
    rerender(<SaveButton title="Graduate Engineer" saved />);
    button = screen.getByRole("button", { name: "Save Graduate Engineer" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("♥");
    expect(button.className).toContain("text-save-on");
  });
});

describe("ListingRow", () => {
  it("renders a heading link, facts as a list and a named save control", () => {
    render(
      <ListingRow
        organisation="Example Power Services"
        title="Graduate Electrical Engineer"
        href="/x"
        facts={["Harare", "Full-time"]}
        tags={[{ label: "Closes in 3 days", tone: "urgent" }]}
        saved={false}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Graduate Electrical Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Graduate Electrical Engineer" })).toHaveAttribute("href", "/x");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Save Graduate Electrical Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Closes in 3 days").className).toContain("text-urgent");
  });
});

describe("Tag, Notice, EmptyState", () => {
  it("applies tone tokens", () => {
    render(
      <>
        <Tag tone="good">Source checked</Tag>
        <Tag>Plain</Tag>
      </>,
    );
    expect(screen.getByText("Source checked").className).toContain("text-good");
    expect(screen.getByText("Plain").className).toContain("bg-tag-bg");
  });
  it("Notice is a note landmark", () => {
    render(<Notice>Hello</Notice>);
    expect(screen.getByRole("note")).toHaveTextContent("Hello");
  });
  it("EmptyState explains what happened", () => {
    render(<EmptyState title="Nothing found">Clear a filter.</EmptyState>);
    expect(screen.getByRole("heading", { name: "Nothing found" })).toBeInTheDocument();
    expect(screen.getByText("Clear a filter.")).toBeInTheDocument();
  });
});
