import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SignInTwoStepForm } from "@/components/account/sign-in-two-step-form";
import { TrustedDevicesPanel } from "@/components/account/trusted-devices-panel";
import { TwoStepForm } from "@/components/workspace/two-step-form";
import type { TrustedDeviceInfo } from "@/lib/session";
import { readRepoFile } from "./helpers";

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.values(router).forEach((m) => m.mockClear());
});

function capture(status = 200, body: unknown = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}
const sent = (calls: { init: RequestInit }[]) => JSON.parse(String(calls[0]!.init.body));

describe("the option after a code", () => {
  it("sign-in offers it unticked, and says what it does and does not do", () => {
    capture();
    render(<SignInTwoStepForm />);
    const box = screen.getByLabelText("Trust this device for 30 days") as HTMLInputElement;
    expect(box.checked).toBe(false); // never on by default
    expect(screen.getByText(/new browsers and after you change your password/)).toBeInTheDocument();
  });

  it("sign-in sends trust_device false by default and true when ticked", async () => {
    const calls = capture(200, { roles: [] });
    render(<SignInTwoStepForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe("/api/v1/auth/login/two-step");
    expect(sent(calls)).toEqual({ code: "123456", trust_device: false });
    cleanup();
    const again = capture(200, { roles: [] });
    render(<SignInTwoStepForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByLabelText("Trust this device for 30 days"));
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(again).toHaveLength(1));
    expect(sent(again)).toEqual({ code: "654321", trust_device: true });
  });

  it("the staff step offers it too and states the 24-hour rule; the choice goes to the staff API", async () => {
    const calls = capture(200, { verified: true });
    render(<TwoStepForm enrolling={false} next="/workspace" />);
    expect(screen.getByText(/Staff still enter a code at least every 24 hours/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "111222" } });
    fireEvent.click(screen.getByLabelText("Trust this device for 30 days"));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe("/api/v1/staff/two-step");
    expect(sent(calls)).toEqual({ code: "111222", trust_device: true });
  });

  it("keeps no trust decision in the browser: no storage, no fingerprint", () => {
    for (const file of [
      "apps/web/src/components/account/trusted-devices-panel.tsx",
      "apps/web/src/components/account/sign-in-two-step-form.tsx",
      "apps/web/src/components/workspace/two-step-form.tsx",
    ]) {
      const source = readRepoFile(file);
      expect(source).not.toMatch(/localStorage|sessionStorage|navigator\.userAgent|canvas|fingerprint/i);
    }
  });
});

const devices: TrustedDeviceInfo[] = [
  {
    id: "d1",
    label: "Chrome on Android",
    created_at: "2026-10-30T08:00:00Z",
    last_used_at: "2026-11-01T08:00:00Z",
    last_mfa_at: "2026-10-30T08:00:00Z",
    expires_at: "2026-11-29T08:00:00Z",
    current: true,
  },
  {
    id: "d2",
    label: "Firefox on Linux",
    created_at: "2026-10-20T08:00:00Z",
    last_used_at: "2026-10-21T08:00:00Z",
    last_mfa_at: "2026-10-20T08:00:00Z",
    expires_at: "2026-11-19T08:00:00Z",
    current: false,
  },
];

describe("Account → Security: trusted devices", () => {
  it("lists each device with when it was trusted, last used, last code and expiry", () => {
    render(<TrustedDevicesPanel devices={devices} codeEveryHours={null} />);
    expect(screen.getByRole("heading", { name: "Trusted devices" })).toBeInTheDocument();
    expect(screen.getByText(/Chrome on Android \(this browser\)/)).toBeInTheDocument();
    expect(screen.getByText(/Firefox on Linux/)).toBeInTheDocument();
    expect(screen.getAllByText(/code last entered/)).toHaveLength(2);
    expect(screen.queryByText(/at least every 24 hours/)).toBeNull();
  });

  it("tells staff about the 24-hour limit", () => {
    render(<TrustedDevicesPanel devices={devices} codeEveryHours={24} />);
    expect(screen.getByText(/still enter a code at least every 24 hours/)).toBeInTheDocument();
  });

  it("forgets one device with a CSRF-protected DELETE and drops it from the list", async () => {
    const calls = capture(204);
    render(<TrustedDevicesPanel devices={devices} codeEveryHours={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Forget Firefox on Linux/ }));
    await waitFor(() => expect(screen.queryByText(/Firefox on Linux/)).toBeNull());
    expect(calls[0]!.url).toBe("/api/v1/me/trusted-devices/d2");
    expect(calls[0]!.init.method).toBe("DELETE");
    expect((calls[0]!.init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok123");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("forgets all of them and then explains how to add one again", async () => {
    const calls = capture(204);
    render(<TrustedDevicesPanel devices={devices} codeEveryHours={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Forget all trusted devices" }));
    await waitFor(() => expect(screen.getByText(/No trusted devices/)).toBeInTheDocument());
    expect(calls[0]!.url).toBe("/api/v1/me/trusted-devices");
  });

  it("shows a failure instead of pretending it worked", async () => {
    capture(500, { error: { code: "server_error", message: "x", request_id: "r" } });
    render(<TrustedDevicesPanel devices={devices} codeEveryHours={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Forget Chrome on Android/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Chrome on Android \(this browser\)/)).toBeInTheDocument();
  });

  it("is placed on the security page, only where two-step verification is on", () => {
    const page = readRepoFile("apps/web/src/app/account/security/page.tsx");
    expect(page).toMatch(/twoStep\?\.enabled && trusted/);
    expect(page).toContain("TrustedDevicesPanel");
  });
});
