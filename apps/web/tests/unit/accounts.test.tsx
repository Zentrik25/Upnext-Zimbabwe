import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ForgotPasswordForm } from "@/components/account/forgot-password-form";
import { RegisterForm } from "@/components/account/register-form";
import { ResetPasswordForm } from "@/components/account/reset-password-form";
import { SaveToggle } from "@/components/account/save-toggle";
import { SignInForm } from "@/components/account/sign-in-form";
import { VerifyEmailPanel } from "@/components/account/verify-email-panel";
import { apiFetch, describeFailure, readCsrfCookie } from "@/lib/client-api";
import { safeNext } from "@/lib/safe-next";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

/** Scripted fetch: replies are consumed in order; every request is recorded. */
function script(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const reply = replies.shift() ?? { status: 200, body: {} };
      const status = reply.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
        status,
        headers: reply.headers,
      });
    }),
  );
  return calls;
}
const error = (status: number, code: string, fields?: Record<string, { message: string }[]>): Reply => ({
  status,
  body: { error: { code, message: "m", request_id: "r", fields } },
});
const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  document.cookie = "upnext_csrf=tok123";
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("safeNext", () => {
  it("accepts known same-origin routes and keeps their query", () => {
    expect(safeNext("/saved")).toBe("/saved");
    expect(safeNext("/opportunities?category=jobs")).toBe("/opportunities?category=jobs");
    expect(safeNext("/opportunities/graduate-engineer-abc123")).toBe(
      "/opportunities/graduate-engineer-abc123",
    );
    expect(safeNext(["/account", "/x"])).toBe("/account");
  });
  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/staff/",
    "/api/v1/me",
    "/sign-in",
    "",
    "/" + "a".repeat(400),
  ])("falls back for %s", (value) => {
    expect(safeNext(value)).toBe("/account");
  });
  it("falls back for missing values and honours a given fallback", () => {
    expect(safeNext(undefined)).toBe("/account");
    expect(safeNext(null, "/")).toBe("/");
  });
});

describe("client api", () => {
  it("reads the CSRF cookie in either naming form", () => {
    expect(readCsrfCookie("a=1; upnext_csrf=abc%20d; b=2")).toBe("abc d");
    expect(readCsrfCookie("__Host-upnext_csrf=zzz")).toBe("zzz");
    expect(readCsrfCookie("other=1")).toBeNull();
  });
  it("sends JSON with the CSRF header and no storage of credentials", async () => {
    const calls = script({ status: 202, body: { status: "accepted" } });
    const outcome = await apiFetch("POST", "auth/register", { email: "a@b.example" });
    expect(outcome).toMatchObject({ ok: true, status: 202 });
    const { url, init } = calls[0]!;
    expect(url).toBe("/api/v1/auth/register");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok123");
    expect(init.body).toBe('{"email":"a@b.example"}');
  });
  it("fetches a CSRF token when the cookie is missing, and reads nothing on GET", async () => {
    document.cookie = "upnext_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    const calls = script({ body: { csrf_token: "fresh" } }, { status: 204 });
    await apiFetch("DELETE", "me/saved/x");
    expect(calls.map((c) => c.url)).toEqual(["/api/v1/auth/csrf", "/api/v1/me/saved/x"]);
    expect((calls[1]!.init.headers as Record<string, string>)["X-CSRFToken"]).toBe("fresh");
    script({ body: [] });
    await apiFetch("GET", "me");
  });
  it("turns failures into codes, field messages and Retry-After", async () => {
    script(error(400, "validation_failed", { email: [{ message: "Enter a valid e-mail address." }] }));
    const bad = await apiFetch("POST", "auth/register", {});
    expect(bad).toMatchObject({
      ok: false,
      code: "validation_failed",
      fields: { email: ["Enter a valid e-mail address."] },
    });
    script({
      status: 429,
      body: { error: { code: "rate_limited", message: "m", request_id: "r" } },
      headers: { "Retry-After": "120" },
    });
    const limited = await apiFetch("POST", "auth/login", {});
    expect(limited).toMatchObject({ ok: false, code: "rate_limited", retryAfter: 120 });
    expect(describeFailure(limited as never)).toBe("Too many attempts. Try again in 2 minutes.");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const down = await apiFetch("GET", "me");
    expect(down).toMatchObject({ ok: false, code: "network", status: 0 });
  });
  it("words every stable code in plain language", () => {
    const base = { ok: false as const, status: 400, message: "raw", fields: {}, retryAfter: null };
    expect(describeFailure({ ...base, code: "invalid_credentials" })).toBe("Incorrect e-mail or password.");
    expect(describeFailure({ ...base, code: "email_not_verified" })).toContain(
      "Confirm your e-mail address first",
    );
    expect(describeFailure({ ...base, code: "reauth_required" })).toBe("That password is not correct.");
    expect(describeFailure({ ...base, status: 500, code: "x" })).toContain("our side");
  });
});

describe("RegisterForm", () => {
  it("shows the same neutral message for any address and offers a resend", async () => {
    const calls = script({ status: 202, body: { status: "accepted" } });
    render(<RegisterForm />);
    type("Name", "Tendai Moyo");
    type("E-mail address", "taken@example.org");
    type("Password", "a long enough passphrase");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Check your e-mail")).toBeInTheDocument();
    expect(screen.getByText(/If this address can be used/)).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      email: "taken@example.org",
      password: "a long enough passphrase",
      display_name: "Tendai Moyo",
    });
    expect(screen.getByRole("button", { name: "Send the link again" })).toBeInTheDocument();
  });
  it("shows field errors from the server beside the fields", async () => {
    script(error(400, "validation_failed", { password: [{ message: "This password is too common." }] }));
    render(<RegisterForm />);
    type("Name", "T");
    type("E-mail address", "a@example.org");
    type("Password", "password1234");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Error:", { exact: false })).toBeInTheDocument();
  });
});

describe("SignInForm", () => {
  it("signs in and goes to a safe return address only", async () => {
    script({ status: 200, body: { id: "u" } });
    render(<SignInForm next="https://evil.example/" />);
    type("E-mail address", "a@example.org");
    type("Password", "pw");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/account"));
    expect(router.refresh).toHaveBeenCalled();
  });
  it("goes where it was asked when the address is a known route", async () => {
    script({ status: 200, body: { id: "u" } });
    render(<SignInForm next="/saved" />);
    type("E-mail address", "a@example.org");
    type("Password", "pw");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/saved"));
  });
  it("uses one message for wrong credentials and offers resend only for unconfirmed accounts", async () => {
    script(error(401, "invalid_credentials"));
    render(<SignInForm />);
    type("E-mail address", "a@example.org");
    type("Password", "pw");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Incorrect e-mail or password\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send the link again" })).toBeNull();
    script(error(403, "email_not_verified"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Send the link again" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("ForgotPasswordForm", () => {
  it("never says whether the address exists", async () => {
    script({ status: 202, body: { status: "accepted" } });
    render(<ForgotPasswordForm />);
    type("E-mail address", "ghost@example.org");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/If an account uses this address/)).toBeInTheDocument();
  });
});

describe("one-time token pages", () => {
  it("removes the token from the visible address", () => {
    window.history.replaceState(null, "", "/reset-password?token=abc.def");
    render(<ResetPasswordForm token="abc.def" />);
    expect(window.location.search).toBe("");
  });
  it("submits the reset with the token and shows success", async () => {
    const calls = script({ status: 204 });
    render(<ResetPasswordForm token="abc.def" />);
    type("New password", "a long enough passphrase");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      token: "abc.def",
      new_password: "a long enough passphrase",
    });
  });
  it("shows an invalid link, not a form, without a token or after a refusal", async () => {
    render(<ResetPasswordForm token={null} />);
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
    cleanup();
    script(error(400, "invalid_token"));
    render(<ResetPasswordForm token="bad" />);
    type("New password", "a long enough passphrase");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });
  it("confirms the e-mail address only on an explicit click", async () => {
    const calls = script({ status: 204 });
    render(<VerifyEmailPanel token="abc.def" />);
    expect(calls).toHaveLength(0); // opening the link consumes nothing
    fireEvent.click(screen.getByRole("button", { name: "Confirm e-mail address" }));
    expect(await screen.findByText("E-mail address confirmed")).toBeInTheDocument();
    expect(calls[0]!.url).toBe("/api/v1/auth/email/verify");
  });
});

describe("SaveToggle", () => {
  it("sends visitors to sign in and back to the same place", () => {
    render(
      <SaveToggle
        opportunityId="o1"
        title="Engineer"
        initialSaved={false}
        signedIn={false}
        returnTo="/opportunities?q=x"
      />,
    );
    const link = screen.getByRole("link", { name: "Sign in to save Engineer" });
    expect(link).toHaveAttribute("href", "/sign-in?next=%2Fopportunities%3Fq%3Dx");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("saves and unsaves, announcing the change, with a pressed state", async () => {
    const calls = script({ status: 201, body: {} }, { status: 204 });
    render(<SaveToggle opportunityId="o1" title="Engineer" initialSaved={false} signedIn returnTo="/" />);
    const button = screen.getByRole("button", { name: "Save Engineer" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved: Engineer");
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(calls.map((c) => c.init.method)).toEqual(["PUT", "DELETE"]);
    expect(calls[0]!.url).toBe("/api/v1/me/saved/o1");
  });
  it("keeps the old state and says why when the listing cannot be saved or the session ended", async () => {
    script(error(409, "listing_not_saveable"));
    render(<SaveToggle opportunityId="o1" title="Engineer" initialSaved={false} signedIn returnTo="/" />);
    const button = screen.getByRole("button", { name: "Save Engineer" });
    fireEvent.click(button);
    expect(await screen.findByText(/no longer open/)).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");
    script(error(401, "unauthenticated"));
    fireEvent.click(button);
    expect(await screen.findByText(/Sign in again to save/)).toBeInTheDocument();
  });
  it("refreshes the page after a change when asked (the saved list)", async () => {
    script({ status: 204 });
    render(
      <SaveToggle
        opportunityId="o1"
        title="Engineer"
        initialSaved
        signedIn
        returnTo="/saved"
        refreshOnChange
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Engineer" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
});
