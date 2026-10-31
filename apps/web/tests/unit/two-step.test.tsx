import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,AAAA") } }));

import { PasswordPanel } from "@/components/account/account-panels";
import { SignInForm } from "@/components/account/sign-in-form";
import { SignInTwoStepForm } from "@/components/account/sign-in-two-step-form";
import { initialsOf } from "@/lib/initials";
import { TwoStepPanel } from "@/components/account/two-step-panel";
import { safeNext } from "@/lib/safe-next";

type Reply = { status?: number; body?: unknown };
function script(...replies: Reply[]) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const reply = replies.shift() ?? { status: 200, body: {} };
      const status = reply.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), { status });
    }),
  );
  return calls;
}
const error = (status: number, code: string, message = "m"): Reply => ({
  status,
  body: { error: { code, message, request_id: "r" } },
});
const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("account settings helpers", () => {
  it("takes up to two initials and never an empty avatar", () => {
    expect(initialsOf("Silver Silver")).toBe("SS");
    expect(initialsOf("  ada  ")).toBe("A");
    expect(initialsOf("Tendai Chipo Moyo")).toBe("TM");
    expect(initialsOf("   ")).toBe("?");
  });
  it("accepts the account sub-pages as sign-in destinations and nothing else under /account", () => {
    for (const ok of ["/account/personal", "/account/security", "/account/sessions", "/account/delete"])
      expect(safeNext(ok)).toBe(ok);
    expect(safeNext("/account/other", "/")).toBe("/");
  });
});

describe("sign-in second step", () => {
  it("sends the person to the code page when the API asks for one", async () => {
    script({ body: { two_step_required: true } });
    render(<SignInForm next="/saved" />);
    type(/E-mail address/, "a@example.org");
    type(/^Password/, "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in/two-step?next=%2Fsaved"));
  });

  it("completes sign-in with a code and goes on to the requested page", async () => {
    const calls = script({ body: { roles: [] } });
    render(<SignInTwoStepForm next="/saved" />);
    type(/Verification code/, " 123456 ");
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/saved"));
    expect(calls.at(-1)).toEqual({ url: "/api/v1/auth/login/two-step", body: { code: "123456" } });
  });

  it("shows the API's message for a wrong code and keeps the form", async () => {
    script(error(400, "invalid_code", "That code is not valid."));
    render(<SignInTwoStepForm />);
    type(/Verification code/, "000000");
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That code is not valid.");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("offers a way back when the pending sign-in has expired", async () => {
    script(error(400, "two_step_expired", "Your sign-in timed out."));
    render(<SignInTwoStepForm />);
    type(/Verification code/, "000000");
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("link", { name: "Back to sign in" })).toBeTruthy();
  });
});

describe("TwoStepPanel", () => {
  it("walks through password, scan and code, then shows the recovery codes once", async () => {
    const calls = script(
      { body: { secret: "ABCD EFGH", uri: "otpauth://totp/x?secret=ABCDEFGH" } },
      { body: { recovery_codes: ["aaaaaa-bbbbbb", "cccccc-dddddd"] } },
    );
    render(<TwoStepPanel enabled={false} codesLeft={0} staff={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-step verification" }));
    type(/Your password/, "pw-pw-pw-pw-pw");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByAltText(/QR code/)).toBeTruthy();
    expect(screen.getByText("ABCD EFGH")).toBeTruthy();
    type(/6-digit code/, "123456");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("aaaaaa-bbbbbb")).toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual(["/api/v1/me/two-step/setup", "/api/v1/me/two-step/confirm"]);
    fireEvent.click(screen.getByRole("button", { name: "I have saved these codes" }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("says the password is wrong instead of starting", async () => {
    script(error(403, "reauth_required"));
    render(<TwoStepPanel enabled={false} codesLeft={0} staff={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-step verification" }));
    type(/Your password/, "nope");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That password is not correct.");
    expect(screen.queryByAltText(/QR code/)).toBeNull();
  });

  it("turns it off only with password and code", async () => {
    const calls = script({ status: 204 });
    render(<TwoStepPanel enabled codesLeft={1} staff={false} />);
    expect(screen.getByText("1 recovery code left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn off…" }));
    type(/Your password/, "pw-pw-pw-pw-pw");
    type(/Code or recovery code/, "123456");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(calls[0]).toEqual({
      url: "/api/v1/me/two-step/disable",
      body: { password: "pw-pw-pw-pw-pw", code: "123456" },
    });
  });

  it("leaves staff to the staff workspace", () => {
    render(<TwoStepPanel enabled={false} codesLeft={0} staff />);
    expect(screen.getByRole("link", { name: "Open the staff workspace" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("PasswordPanel", () => {
  it("refuses a confirmation that differs, without calling the API", () => {
    const calls = script();
    render(<PasswordPanel />);
    type(/Current password/, "old-old-old-old");
    type(/^New password/, "new-new-new-new");
    type(/Confirm new password/, "other-other-other");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText(/not the same/)).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
  it("has a show/hide control on every password field", () => {
    render(<PasswordPanel />);
    expect(screen.getAllByRole("button", { name: "Show password" })).toHaveLength(3);
  });
});
