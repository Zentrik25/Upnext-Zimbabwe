import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SessionsPanel, type SessionRow } from "@/components/account/account-panels";

const rows: SessionRow[] = [
  {
    id: "a",
    created_at: "2026-10-31T05:00:00Z",
    last_seen_at: "2026-10-31T05:10:00Z",
    user_agent_summary: "Chrome on Linux",
    current: true,
  },
  {
    id: "b",
    created_at: "2026-10-30T05:00:00Z",
    last_seen_at: "2026-10-30T05:10:00Z",
    user_agent_summary: "Firefox on Windows",
    current: false,
  },
  {
    id: "c",
    created_at: "2026-10-29T05:00:00Z",
    last_seen_at: "2026-10-29T05:10:00Z",
    user_agent_summary: "Safari on iOS",
    current: false,
  },
];

function reply(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify({ error: { code: "server_error", message: "m", request_id: "r" } }), {
            status,
          }),
    ),
  );
}

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SessionsPanel", () => {
  it("offers sign-out only for the other browsers", () => {
    render(<SessionsPanel sessions={rows} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Sign out/ })).toHaveLength(2);
  });

  it("drops a signed-out session at once, before the server refresh answers", async () => {
    reply(204);
    render(<SessionsPanel sessions={rows} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Sign out/ })[0]!);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.queryByText(/Firefox on Windows/)).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps the session and says so when the API refuses", async () => {
    reply(500);
    render(<SessionsPanel sessions={rows} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Sign out/ })[0]!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
