import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AlertForm } from "@/components/seeker/alert-form";
import { CheckboxGroup } from "@/components/seeker/checkbox-group";
import { ProfileForm } from "@/components/seeker/profile-form";
import { RecommendedRow } from "@/components/seeker/recommended-row";
import { SkillPicker } from "@/components/seeker/skill-picker";
import { UnsubscribePanel } from "@/components/seeker/unsubscribe-panel";
import type { ForYouRow, JobAlert, SeekerProfile } from "@/lib/seeker-types";
import type { OpportunitySummary } from "@/lib/catalog-types";

type Reply = { status?: number; body?: unknown };
function script(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const reply = replies.shift() ?? { status: 200, body: {} };
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
      });
    }),
  );
  return calls;
}

const empty: SeekerProfile = {
  exists: false,
  home_location: null,
  highest_qualification: null,
  experience_level: null,
  work_arrangements: [],
  employment_types: [],
  categories: [],
  sectors: [],
  preferred_locations: [],
  skills: [],
  fields_filled: 0,
  fields_total: 9,
  updated_at: null,
};
const categories: { code: string; name: string }[] = [
  { code: "jobs", name: "Jobs" },
  { code: "grants", name: "Grants" },
];
const sectors = [{ id: "s1", slug: "engineering", name: "Engineering" }];
const locations = [
  { id: "l1", slug: "harare", name: "Harare", kind: "city", parent_slug: null },
  { id: "l2", slug: "remote", name: "Remote", kind: "remote", parent_slug: null },
];
const alert: JobAlert = {
  enabled: false,
  frequency: "weekly",
  categories: [],
  locations: [],
  consented_at: null,
  consent_wording_version: "",
  last_sent_at: null,
  delivery_available: false,
  consent_wording: "Send me an e-mail with new opportunities.",
  updated_at: null,
};

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("checkbox group", () => {
  it("disables the unchecked boxes at the ceiling and says why", () => {
    const onChange = vi.fn();
    render(
      <CheckboxGroup
        name="x"
        legend="Choices"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        selected={["a"]}
        onChange={onChange}
        max={1}
      />,
    );
    expect(screen.getByLabelText("B")).toBeDisabled();
    expect(screen.getByLabelText("A")).not.toBeDisabled();
    expect(screen.getByText(/reached the limit/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("A"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("skill picker", () => {
  it("searches the approved list, adds and removes, and announces it", async () => {
    const calls = script({ body: { data: [{ id: "k1", name: "AutoCAD" }] } });
    const onChange = vi.fn();
    const { rerender } = render(<SkillPicker value={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Skills"), { target: { value: "auto" } });
    const add = await screen.findByRole("button", { name: "Add AutoCAD" });
    expect(calls[0]?.url).toBe("/api/v1/skills?q=auto&limit=8");
    fireEvent.click(add);
    expect(onChange).toHaveBeenCalledWith([{ id: "k1", name: "AutoCAD" }]);
    rerender(<SkillPicker value={[{ id: "k1", name: "AutoCAD" }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove AutoCAD" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("does not search for one letter", () => {
    const calls = script();
    render(<SkillPicker value={[]} onChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Skills"), { target: { value: "a" } });
    expect(calls).toHaveLength(0);
  });
});

describe("profile form", () => {
  it("is optional, private in its wording, and saves exactly what was chosen", async () => {
    const saved = { ...empty, exists: true, categories: categories.slice(0, 1), fields_filled: 1 };
    const calls = script({ body: saved });
    render(<ProfileForm profile={empty} categories={categories} sectors={sectors} locations={locations} />);
    expect(screen.getByTestId("profile-privacy")).toHaveTextContent("Only you can see this");
    expect(screen.getByTestId("profile-privacy")).toHaveTextContent("Every field is optional");
    expect(screen.getByRole("button", { name: "Delete profile" })).toBeDisabled(); // nothing to delete yet
    fireEvent.click(screen.getByLabelText("Jobs"));
    fireEvent.change(screen.getByLabelText("Experience"), { target: { value: "entry" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(calls[0]?.url).toBe("/api/v1/me/profile");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      home_location: null,
      highest_qualification: null,
      experience_level: "entry",
      skills: [],
      categories: ["jobs"],
      sectors: [],
      preferred_locations: [],
      employment_types: [],
      work_arrangements: [],
    });
    expect(await screen.findByText(/Profile saved/)).toBeInTheDocument();
  });

  it("can save an empty profile and show field errors", async () => {
    script({
      status: 400,
      body: {
        error: {
          code: "validation_failed",
          message: "m",
          fields: { skills: [{ message: "Choose skills from the list." }] },
        },
      },
    });
    render(<ProfileForm profile={empty} categories={categories} sectors={sectors} locations={locations} />);
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/Choose skills from the list/)).toBeInTheDocument();
  });

  it("asks before clearing preferences or deleting, and only then calls the API", async () => {
    const stored = { ...empty, exists: true, categories: categories.slice(0, 1), fields_filled: 1 };
    const calls = script({ body: { ...stored, categories: [], fields_filled: 0 } }, { status: 204 });
    render(<ProfileForm profile={stored} categories={categories} sectors={sectors} locations={locations} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset preferences" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Clear your preferences?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset preferences" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear preferences" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("/api/v1/me/profile/reset-preferences");
    expect(await screen.findByText(/Preferences cleared/)).toBeInTheDocument();
    expect(screen.getByLabelText("Jobs")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete my profile" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.init.method).toBe("DELETE");
    expect(await screen.findByText(/Your profile was deleted/)).toBeInTheDocument();
  });
});

describe("alert form", () => {
  it("says plainly that nothing is sent yet, and starts unticked", () => {
    render(<AlertForm alert={alert} categories={categories} locations={locations} />);
    expect(screen.getByTestId("alerts-unavailable")).toHaveTextContent("not being sent yet");
    expect(screen.getByTestId("alert-state")).toHaveTextContent("off");
    expect(screen.getByLabelText(alert.consent_wording)).not.toBeChecked();
  });

  it("turns alerts on with the explicit consent and the chosen options", async () => {
    const calls = script({ body: { ...alert, enabled: true } });
    render(<AlertForm alert={alert} categories={categories} locations={locations} />);
    fireEvent.click(screen.getByLabelText("Jobs"));
    fireEvent.click(screen.getByLabelText("Daily"));
    fireEvent.click(screen.getByLabelText(alert.consent_wording));
    fireEvent.click(screen.getByRole("button", { name: "Turn on job alerts" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(calls[0]?.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      frequency: "daily",
      categories: ["jobs"],
      locations: [],
      enabled: true,
      consent: true,
    });
    expect(screen.getByTestId("alert-state")).toHaveTextContent("on");
  });

  it("shows the server's reasons when consent or a choice is missing", async () => {
    script({
      status: 400,
      body: {
        error: {
          code: "validation_failed",
          message: "m",
          fields: {
            consent: [{ message: "Tick the box to agree to receive these e-mails." }],
            categories: [{ message: "Choose at least one category or place." }],
          },
        },
      },
    });
    render(<AlertForm alert={alert} categories={categories} locations={locations} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on job alerts" }));
    expect(await screen.findByText(/Tick the box to agree/)).toBeInTheDocument();
    expect(screen.getByText(/Choose at least one category or place/)).toBeInTheDocument();
  });

  it("turns alerts off without asking for anything else", async () => {
    const on = { ...alert, enabled: true, categories: categories.slice(0, 1) };
    const calls = script({ body: alert });
    render(<AlertForm alert={on} categories={categories} locations={locations} />);
    expect(screen.queryByLabelText(alert.consent_wording)).toBeNull(); // no second consent while on
    fireEvent.click(screen.getByRole("button", { name: "Turn off job alerts" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ enabled: false });
  });

  it("does not claim sending is unavailable once delivery is verified", () => {
    render(
      <AlertForm
        alert={{ ...alert, delivery_available: true }}
        categories={categories}
        locations={locations}
      />,
    );
    expect(screen.queryByTestId("alerts-unavailable")).toBeNull();
  });
});

describe("unsubscribe panel", () => {
  it("posts the token and confirms", async () => {
    const calls = script({ status: 204 });
    render(<UnsubscribePanel token="abc.def" />);
    fireEvent.click(screen.getByRole("button", { name: "Stop job alert e-mails" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Job alerts are off");
    expect(calls[0]?.url).toBe("/api/v1/alerts/unsubscribe");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ token: "abc.def" });
  });

  it("explains an invalid link", async () => {
    script({ status: 400, body: { error: { code: "invalid_token", message: "m" } } });
    render(<UnsubscribePanel token="bad" />);
    fireEvent.click(screen.getByRole("button", { name: "Stop job alert e-mails" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is not valid");
  });
});

describe("recommended row", () => {
  const opportunity = {
    id: "o1",
    slug: "graduate-engineer-abcd1234",
    title: "Graduate Engineer",
    summary: "",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "g1", name: "Example Power" },
    locations: [{ slug: "harare", name: "Harare", is_primary: true }],
    work_mode: "on_site",
    employment_type: "permanent",
    deadline: { at: null, timezone: null, is_date_only: false, state: "unknown" },
    salary: null,
    verification: { level: "not_verified", checked_at: null },
    primary_source_name: "Issuer website",
    status: "published",
    published_at: "2026-10-01T00:00:00Z",
    is_saved: false,
  } as unknown as OpportunitySummary;

  it("shows why a listing is shown and what it does not say, without claiming eligibility", () => {
    const row: ForYouRow = {
      opportunity,
      match: {
        reasons: [{ signal: "category_interest", text: "Matches your interest in Jobs." }],
        unknowns: [{ signal: "skills", text: "The listing does not list skills." }],
        notes: [
          {
            signal: "education",
            text: "Lists a minimum of Master's degree, above the level in your profile.",
          },
        ],
      },
    };
    render(<RecommendedRow row={row} returnTo="/for-you" />);
    expect(screen.getByTestId("why")).toHaveTextContent("Why you are seeing this");
    expect(screen.getByText("Matches your interest in Jobs.")).toBeInTheDocument();
    expect(screen.getByText("The listing does not list skills.")).toBeInTheDocument();
    expect(screen.getByTestId("why").textContent).not.toMatch(/eligible|qualify|guarantee/i);
    expect(screen.getByRole("link", { name: "Graduate Engineer" })).toHaveAttribute(
      "href",
      "/opportunities/graduate-engineer-abcd1234",
    );
  });

  it("shows nothing extra for the newest-first fallback", () => {
    render(
      <RecommendedRow
        row={{ opportunity, match: { reasons: [], unknowns: [], notes: [] } }}
        returnTo="/for-you"
      />,
    );
    expect(screen.queryByTestId("why")).toBeNull();
  });
});
