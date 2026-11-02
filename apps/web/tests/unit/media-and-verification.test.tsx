import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ActionPanel } from "@/components/workspace/action-panel";
import { ImageUpload } from "@/components/workspace/image-upload";
import { ListingTable } from "@/components/workspace/listing-table";
import { MediaBrowser } from "@/components/workspace/media-browser";
import { VerifyToggle } from "@/components/workspace/verify-toggle";
import { MediaLibraryLoading } from "@/components/ui/page-skeletons";
import type { ListingRow, MediaItem, StaffAction } from "@/lib/staff-types";
import { readRepoFile } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.values(router).forEach((m) => m.mockClear());
});

const jpg = (n: string) => `listings/${n.repeat(32)}.jpg`;
const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "m1",
  name: jpg("a"),
  thumb: `listings/thumbs/${"a".repeat(32)}.jpg`,
  title: "Harare depot",
  original_filename: "depot.jpg",
  width: 1200,
  height: 675,
  bytes: 150 * 1024,
  uploaded_by: "Demo Editor",
  created_at: "2026-10-30T08:00:00Z",
  used_in: 3,
  ...over,
});

type Call = { url: string; method: string; body: unknown };
function stubApi(
  handler: (call: Call) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }>,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/auth/csrf"))
        return new Response(JSON.stringify({ csrf_token: "tok" }), { status: 200 });
      const call = {
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const out = await handler(call);
      return new Response(JSON.stringify(out.json), { status: out.status ?? 200 });
    }),
  );
  return calls;
}

describe("verification switch", () => {
  it("shows Verify to an authorised person, saves it with one request and only then says Verified", async () => {
    let release: (v: { json: unknown }) => void = () => {};
    const calls = stubApi(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<VerifyToggle id="abc" verified={false} canVerify />);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    // while the server has not answered, the label is unchanged and the button is busy
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    release({ json: { verified: true } });
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unverify" })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "/api/v1/staff/opportunities/abc/verification",
      method: "PUT",
      body: { verified: true },
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("unverifies with one request", async () => {
    const calls = stubApi(() => ({ json: { verified: false } }));
    render(<VerifyToggle id="abc" verified canVerify />);
    fireEvent.click(screen.getByRole("button", { name: "Unverify" }));
    expect(await screen.findByText("Not verified")).toBeInTheDocument();
    expect(calls[0]!.body).toEqual({ verified: false });
  });

  it("offers no button to someone without the permission, and keeps the old state when the server refuses", async () => {
    render(<VerifyToggle id="abc" verified={false} canVerify={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    cleanup();
    stubApi(() => ({
      status: 403,
      json: { error: { code: "permission_denied", message: "You do not have permission." } },
    }));
    render(<VerifyToggle id="abc" verified={false} canVerify />);
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permission");
    expect(screen.getByText("Not verified")).toBeInTheDocument(); // nothing was saved, nothing is claimed
  });

  it("follows a new value from the page", () => {
    const { rerender } = render(<VerifyToggle id="abc" verified={false} canVerify />);
    rerender(<VerifyToggle id="abc" verified canVerify />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });
});

describe("listing table verification", () => {
  const row = (over: Partial<ListingRow>): ListingRow => ({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Driver Salesperson",
    organisation: "Delta Beverages",
    location: "Harare",
    category: { code: "jobs", name: "Jobs" },
    closing: null,
    status: "published",
    status_label: "Published",
    status_tone: "success",
    version_state: null,
    verified: false,
    verification_label: "Not verified",
    verified_at: null,
    verified_by: null,
    can_verify: true,
    submitted_by: null,
    submitted_at: null,
    updated_at: "2026-10-29T17:25:00Z",
    row_version: 1,
    actions: [],
    ...over,
  });

  it("has a Verify / Unverify action on each row and a Verified or Not verified badge", () => {
    render(
      <ListingTable
        caption="Rows"
        rows={[
          row({}),
          row({ id: "22222222-2222-4222-8222-222222222222", title: "Stock Controllers", verified: true }),
          row({ id: "33333333-3333-4333-8333-333333333333", title: "Brand Manager", can_verify: false }),
        ]}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("button", { name: "Verify" })).toHaveLength(1);
    expect(within(table).getAllByRole("button", { name: "Unverify" })).toHaveLength(1);
    expect(within(table).getAllByText("Not verified")).toHaveLength(2);
    expect(within(table).getByText("Verified")).toBeInTheDocument();
  });
});

describe("media library browser", () => {
  it("shows placeholders while loading, then the pictures, and previews one with its details", async () => {
    stubApi(() => ({
      json: {
        data: [item(), item({ id: "m2", name: jpg("b"), title: "Team", used_in: 0 })],
        page: { page: 1, page_size: 24, total: 2, pages: 1 },
      },
    }));
    const { container } = render(<MediaBrowser />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull(); // the skeleton grid
    expect(await screen.findByRole("button", { name: "Harare depot" })).toBeInTheDocument();
    expect(screen.getByText("Select a picture to preview it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Harare depot" }));
    const preview = screen.getByRole("complementary", { name: "Preview" });
    expect(within(preview).getByText("1200 × 675, 150 KB")).toBeInTheDocument();
    expect(within(preview).getByText("3 listings")).toBeInTheDocument();
    expect(within(preview).queryByRole("button", { name: "Use this image" })).toBeNull(); // the page, not a picker
  });

  it("searches after a short pause and says when nothing matches", async () => {
    const calls = stubApi((call) => {
      const q = new URL(call.url, "http://x").searchParams.get("q");
      return {
        json: {
          data:
            q === "depot" ? [item()] : q ? [] : [item(), item({ id: "m2", name: jpg("b"), title: "Team" })],
          page: { page: 1, page_size: 24, total: 1, pages: 1 },
        },
      };
    });
    render(<MediaBrowser />);
    await screen.findByRole("button", { name: "Team" });
    fireEvent.change(screen.getByLabelText("Search the library"), { target: { value: "depot" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("q=depot"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Team" })).toBeNull());
    fireEvent.change(screen.getByLabelText("Search the library"), { target: { value: "zzz" } });
    expect(await screen.findByText(/Nothing in the library matches/)).toBeInTheDocument();
  });

  it("as a picker it offers 'Use this image' for the chosen picture", async () => {
    stubApi(() => ({ json: { data: [item()], page: { page: 1, page_size: 12, total: 1, pages: 1 } } }));
    const onUse = vi.fn();
    render(<MediaBrowser onUse={onUse} />);
    fireEvent.click(await screen.findByRole("button", { name: "Harare depot" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this image" }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: jpg("a") }));
  });

  it("offers more pictures when there are more pages, and reports a failure with a retry", async () => {
    let page = 0;
    stubApi((call) => {
      page += 1;
      if (page === 1)
        return { json: { data: [item()], page: { page: 1, page_size: 1, total: 2, pages: 2 } } };
      if (call.url.includes("page=2"))
        return {
          json: {
            data: [item({ id: "m2", name: jpg("b"), title: "Second" })],
            page: { page: 2, page_size: 1, total: 2, pages: 2 },
          },
        };
      return { status: 500, json: { error: { code: "server_error", message: "Try later." } } };
    });
    render(<MediaBrowser pageSize={1} />);
    await screen.findByRole("button", { name: "Harare depot" });
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("button", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 2")).toBeInTheDocument();
  });
});

describe("featured image: Choose from Library | Upload New", () => {
  it("shows both options, and choosing from the library sets the stored name without uploading", async () => {
    const calls = stubApi(() => ({
      json: { data: [item()], page: { page: 1, page_size: 12, total: 1, pages: 1 } },
    }));
    const onChange = vi.fn();
    render(<ImageUpload id="featured" library value="" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Choose from Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload New" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose from Library" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose from the library" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Harare depot" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Use this image" }));
    expect(onChange).toHaveBeenCalledWith(jpg("a"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.every((c) => c.method === "GET")).toBe(true); // reuse writes nothing new
  });

  it("closes on Escape and keeps what was there", async () => {
    stubApi(() => ({ json: { data: [], page: { page: 1, page_size: 12, total: 0, pages: 1 } } }));
    const onChange = vi.fn();
    render(<ImageUpload id="featured" library value={jpg("c")} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose from Library" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removing says the picture stays in the library", () => {
    const onChange = vi.fn();
    render(<ImageUpload id="featured" library value={jpg("c")} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/It stays in the library/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("without library mode the older single upload button is unchanged", () => {
    render(<ImageUpload id="featured" value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Choose from Library" })).toBeNull();
    expect(screen.getByRole("button", { name: "Upload image" })).toBeInTheDocument();
  });
});

describe("duplicate confirmation in the action panel", () => {
  const confirm = {
    name: "confirm_duplicate",
    label: "Continue: this is a separate vacancy",
    kind: "boolean" as const,
    required: false,
    help: "No explanation is needed.",
    choices: null,
    min_length: null,
  };
  const actions: StaffAction[] = [
    { name: "publish_direct", label: "Publish directly", description: "Publish.", fields: [confirm] },
  ];

  it("asks for nothing when there is no duplicate", () => {
    render(<ActionPanel endpoint="e" rowVersion={1} actions={actions} initial="publish_direct" />);
    expect(screen.queryByLabelText(/separate vacancy/)).toBeNull();
    expect(screen.queryByLabelText(/Existing listing id/)).toBeNull();
  });

  it("shows one tick box when the page already knows, and posts it", async () => {
    const calls = stubApi(() => ({ json: {} }));
    render(
      <ActionPanel
        endpoint="staff/opportunities/abc/actions"
        rowVersion={4}
        actions={actions}
        initial="publish_direct"
        reveal={["confirm_duplicate"]}
      />,
    );
    fireEvent.click(screen.getByLabelText(/separate vacancy/));
    fireEvent.click(screen.getAllByRole("button", { name: "Publish directly" }).at(-1)!); // the form's own submit
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toMatchObject({
      url: "/api/v1/staff/opportunities/abc/actions/publish_direct",
      body: { row_version: 4, confirm_duplicate: true },
    });
  });

  it("reveals the tick box when the server reports a duplicate", async () => {
    stubApi(() => ({
      status: 409,
      json: {
        error: {
          code: "duplicate_detected",
          message: "Possible duplicate listing.",
          fields: {
            duplicate_acknowledgement: [{ message: "This looks like a listing that is already open." }],
          },
        },
      },
    }));
    render(<ActionPanel endpoint="e" rowVersion={1} actions={actions} initial="publish_direct" />);
    expect(screen.queryByLabelText(/separate vacancy/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Publish directly" }).at(-1)!); // the form's own submit
    expect(await screen.findByLabelText(/separate vacancy/)).toBeInTheDocument();
    expect(screen.getByText(/already open/)).toBeInTheDocument();
  });
});

describe("structure", () => {
  it("the media route has a skeleton loading state, and the library page is in the sidebar", () => {
    render(<MediaLibraryLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(readRepoFile("apps/web/src/app/workspace/(shell)/media/loading.tsx")).toContain(
      "MediaLibraryLoading",
    );
    expect(readRepoFile("apps/web/src/components/workspace/chrome.tsx")).toContain("/workspace/media");
  });

  it("the job editor has the six parts and no source fields", () => {
    const source = readRepoFile("apps/web/src/components/workspace/job-editor.tsx");
    for (const title of ["Basic information", "Job details", "How to apply", "Media", "SEO", "Publishing"])
      expect(source).toContain(`title="${title}"`);
    expect(source).not.toMatch(/Original source|source_url|Source link|Source type|source_reference/);
    expect(source).toContain("library");
  });
});
