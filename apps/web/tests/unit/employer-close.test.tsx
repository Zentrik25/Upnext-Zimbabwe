import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ListingActions } from "@/components/employer/listing-actions";
import type { EmployerListingDetail } from "@/lib/employer-types";

type Reply = { status?: number; body?: unknown };

function script(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const reply = replies.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
    }),
  );
  return calls;
}

const listing = (actions: string[]) =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    row_version: 7,
    next_actions: actions,
  }) as unknown as EmployerListingDetail;

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("closing a published listing", () => {
  it("offers the action only when the server lists it", () => {
    const { container } = render(<ListingActions listing={listing(["edit"])} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    render(<ListingActions listing={listing(["amend", "close"])} />);
    expect(screen.getByRole("button", { name: "Close this listing" })).toBeInTheDocument();
  });

  it("asks for a reason first and sends it with the row version", async () => {
    const calls = script({ status: 200, body: {} });
    render(<ListingActions listing={listing(["close"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this listing" }));
    expect(calls).toHaveLength(0); // nothing is sent before the person confirms
    fireEvent.change(screen.getByLabelText("Why are you closing it?"), {
      target: { value: "  The position has been filled.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Yes, close this listing" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(calls[0]?.url).toBe("/api/v1/employer/listings/11111111-1111-4111-8111-111111111111/close");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      row_version: 7,
      reason: "The position has been filled.",
    });
  });

  it("explains a missing or short reason in plain words", async () => {
    script({
      status: 400,
      body: { error: { code: "validation_failed", message: "m", fields: { reason: [{ message: "x" }] } } },
    });
    render(<ListingActions listing={listing(["close"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this listing" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, close this listing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("10 to 1,000 characters");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("can be cancelled", () => {
    render(<ListingActions listing={listing(["close"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this listing" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("close-form")).not.toBeInTheDocument();
  });
});
