import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => headerValues[k] ?? null }) }));

import { AdSlot } from "@/components/ads/ad-slot";
import { AdUnit } from "@/components/ads/ad-unit";
import { AD_CONSENT_KEY, readAdConsent, setAdConsent } from "@/lib/ad-consent";

const CLIENT = "ca-pub-1234567890123456"; // syntactically valid TEST value
const SLOT = "1234567890";
const googleScripts = () => document.querySelectorAll('script[src*="googlesyndication"]');

beforeEach(() => {
  window.localStorage.clear();
  document.head.querySelectorAll("script[data-upnext-adsense]").forEach((s) => s.remove());
  window.adsbygoogle = undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  for (const k of Object.keys(headerValues)) delete headerValues[k];
});

describe("AdUnit respects the visitor's advertising choice", () => {
  it("before a choice: labelled, space reserved, asks with two equal buttons, and loads nothing from Google", () => {
    const { container } = render(<AdUnit client={CLIENT} slot={SLOT} placement="job-detail" />);
    expect(screen.getByLabelText("Advertisement")).toBeTruthy();
    expect(screen.getByText("Advertisement")).toBeTruthy();
    expect(container.innerHTML).toMatch(/min-h-\[280px\]/); // reserved space (layout shift)
    expect(screen.getByRole("button", { name: "Allow advertisements" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No advertisements" })).toBeTruthy();
    expect(container.querySelector("ins.adsbygoogle")).toBeNull();
    expect(googleScripts().length).toBe(0);
    expect(window.adsbygoogle).toBeUndefined();
  });

  it("after the visitor allows: loads Google's script once and requests one advertisement", () => {
    const { container } = render(<AdUnit client={CLIENT} slot={SLOT} placement="guide" />);
    act(() => screen.getByRole("button", { name: "Allow advertisements" }).click());
    expect(readAdConsent()).toBe("granted");
    expect(googleScripts().length).toBe(1);
    const ins = container.querySelector("ins.adsbygoogle");
    expect(ins?.getAttribute("data-ad-client")).toBe(CLIENT);
    expect(ins?.getAttribute("data-ad-slot")).toBe(SLOT);
    expect(window.adsbygoogle?.length).toBe(1);
  });

  it("after the visitor declines: Google is never contacted and only a one-line way back remains", () => {
    const { container } = render(<AdUnit client={CLIENT} slot={SLOT} placement="guide" />);
    act(() => screen.getByRole("button", { name: "No advertisements" }).click());
    expect(readAdConsent()).toBe("denied");
    expect(container.querySelector("ins")).toBeNull();
    expect(container.innerHTML).not.toMatch(/min-h-\[/); // the reserved space is released
    expect(screen.getByText(/Advertisements are off/)).toBeTruthy();
    expect(googleScripts().length).toBe(0);
  });

  it("a remembered refusal loads nothing on the next page", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "denied");
    render(<AdUnit client={CLIENT} slot={SLOT} placement="job-detail" />);
    expect(screen.getByText(/Advertisements are off/)).toBeTruthy();
    expect(googleScripts().length).toBe(0);
    expect(window.adsbygoogle).toBeUndefined();
  });

  it("the choice can be changed at any time from the block itself", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "denied");
    const { container } = render(<AdUnit client={CLIENT} slot={SLOT} placement="guide" />);
    act(() => screen.getByRole("button", { name: "Allow advertisements" }).click());
    expect(readAdConsent()).toBe("granted");
    expect(container.querySelector("ins.adsbygoogle")).not.toBeNull();
    expect(googleScripts().length).toBe(1);
    act(() => screen.getByRole("button", { name: "Stop advertisements" }).click());
    expect(readAdConsent()).toBe("denied");
    expect(container.querySelector("ins")).toBeNull();
  });

  it("blocked storage counts as no consent", () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readAdConsent()).toBe("unset");
    } finally {
      Storage.prototype.getItem = real;
    }
    act(() => setAdConsent("granted")); // cannot be stored: must not start advertising by itself
  });

  it("never sits inside a link or button and is a labelled landmark apart from the text", () => {
    const { container } = render(<AdUnit client={CLIENT} slot={SLOT} placement="guide" />);
    expect(container.querySelector("a, button")?.closest("aside")).not.toBeNull(); // its own controls only
    expect(container.firstElementChild?.tagName).toBe("ASIDE");
    expect(container.firstElementChild?.className).toMatch(/border-y/);
  });
});

describe("AdSlot renders nothing unless everything is configured and the path allows it", () => {
  const live = {
    UPNEXT_ADSENSE_CLIENT: CLIENT,
    UPNEXT_ADSENSE_MODE: "live",
    UPNEXT_ADSENSE_SLOT_JOB_DETAIL: SLOT,
    UPNEXT_ADSENSE_SLOT_GUIDE: SLOT,
  };
  const stub = (env: Record<string, string>) => {
    for (const k of Object.keys(env)) vi.stubEnv(k, env[k]!);
  };

  it("is empty by default and in verify mode", async () => {
    headerValues["x-pathname"] = "/opportunities/a-job";
    expect(await AdSlot({ placement: "job-detail" })).toBeNull();
    stub({ ...live, UPNEXT_ADSENSE_MODE: "verify" });
    expect(await AdSlot({ placement: "job-detail" })).toBeNull();
  });

  it("is empty without a real ad-unit id", async () => {
    headerValues["x-pathname"] = "/opportunities/a-job";
    stub({ ...live, UPNEXT_ADSENSE_SLOT_JOB_DETAIL: "" });
    expect(await AdSlot({ placement: "job-detail" })).toBeNull();
  });

  it("renders on an allowed path and is empty on every other path", async () => {
    stub(live);
    headerValues["x-pathname"] = "/opportunities/a-job";
    expect(await AdSlot({ placement: "job-detail" })).not.toBeNull();
    for (const path of [
      "/sign-in",
      "/register",
      "/account",
      "/saved",
      "/workspace",
      "/opportunities",
      "/guides/x",
    ]) {
      headerValues["x-pathname"] = path;
      expect(await AdSlot({ placement: "job-detail" }), path).toBeNull();
    }
    headerValues["x-pathname"] = "/guides/apply-safely-and-avoid-scams";
    expect(await AdSlot({ placement: "guide" })).not.toBeNull();
  });
});
