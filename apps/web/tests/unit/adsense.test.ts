import { describe, expect, it } from "vitest";
import {
  adSlotId,
  adsCspExtra,
  adsenseAccountMeta,
  adsenseClient,
  adsenseMode,
  adsenseScriptSrc,
} from "@/lib/adsense";
import { isAdEligiblePath } from "@/lib/ad-rules";

const CLIENT = "ca-pub-1234567890123456"; // a syntactically valid TEST value, not a real publisher id

describe("AdSense configuration is off unless the owner sets it", () => {
  it("renders nothing when the publisher id is unset, blank or malformed", () => {
    expect(adsenseClient({})).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "" })).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "   " })).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "pub-1234567890123456" })).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "ca-pub-1&x=<script>" })).toBeUndefined();
  });

  it("is `off` without BOTH a valid publisher id and an explicit mode", () => {
    expect(adsenseMode({})).toBe("off");
    expect(adsenseMode({ UPNEXT_ADSENSE_CLIENT: CLIENT })).toBe("off");
    expect(adsenseMode({ UPNEXT_ADSENSE_CLIENT: CLIENT, UPNEXT_ADSENSE_MODE: "on" })).toBe("off");
    expect(adsenseMode({ UPNEXT_ADSENSE_MODE: "live" })).toBe("off");
    expect(adsenseMode({ UPNEXT_ADSENSE_CLIENT: CLIENT, UPNEXT_ADSENSE_MODE: "verify" })).toBe("verify");
    expect(adsenseMode({ UPNEXT_ADSENSE_CLIENT: CLIENT, UPNEXT_ADSENSE_MODE: " LIVE " })).toBe("live");
  });

  it("builds the Google script URL from a valid id", () => {
    expect(adsenseScriptSrc(CLIENT)).toBe(
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`,
    );
  });

  it("ad-unit ids must be real digits per placement; nothing is hard-coded", () => {
    expect(adSlotId("job-detail", {})).toBeUndefined();
    expect(adSlotId("job-detail", { UPNEXT_ADSENSE_SLOT_JOB_DETAIL: "abc" })).toBeUndefined();
    expect(adSlotId("job-detail", { UPNEXT_ADSENSE_SLOT_JOB_DETAIL: "1234567890" })).toBe("1234567890");
    expect(adSlotId("guide", { UPNEXT_ADSENSE_SLOT_JOB_DETAIL: "1234567890" })).toBeUndefined();
  });
});

describe("Content-Security-Policy additions for advertising", () => {
  const live = { UPNEXT_ADSENSE_CLIENT: CLIENT, UPNEXT_ADSENSE_MODE: "live" };
  it("adds nothing unless advertising is live", () => {
    expect(adsCspExtra("/guides/x", isAdEligiblePath, {})).toEqual({});
    expect(adsCspExtra("/guides/x", isAdEligiblePath, { ...live, UPNEXT_ADSENSE_MODE: "verify" })).toEqual(
      {},
    );
  });
  it("adds Google hosts only on a path where an ad may appear", () => {
    expect(adsCspExtra("/opportunities/some-job", isAdEligiblePath, live)["frame-src"]).toBeDefined();
    for (const path of ["/", "/sign-in", "/account", "/saved", "/workspace", "/privacy", "/opportunities"])
      expect(adsCspExtra(path, isAdEligiblePath, live), path).toEqual({});
  });
});

describe("the google-adsense-account ownership meta tag (D-79)", () => {
  it("carries the configured publisher id on public pages in every mode, and nothing when unset or malformed", () => {
    for (const mode of [undefined, "off", "verify", "live"]) {
      const env = { UPNEXT_ADSENSE_CLIENT: CLIENT, UPNEXT_ADSENSE_MODE: mode };
      for (const path of [
        "/",
        "/opportunities",
        "/opportunities/x-abc123",
        "/guides",
        "/insights",
        "/privacy",
      ])
        expect(adsenseAccountMeta(path, env), `${mode} ${path}`).toBe(CLIENT);
    }
    expect(adsenseAccountMeta("/", {})).toBeUndefined();
    expect(adsenseAccountMeta("/", { UPNEXT_ADSENSE_CLIENT: "pub-123" })).toBeUndefined();
  });

  it("is never on the staff workspace or the employer dashboard (the public /employers pages keep it)", () => {
    const env = { UPNEXT_ADSENSE_CLIENT: CLIENT };
    for (const path of ["/workspace", "/workspace/seo", "/employer", "/employer/listings/new"])
      expect(adsenseAccountMeta(path, env), path).toBeUndefined();
    expect(adsenseAccountMeta("/employers/acme", env)).toBe(CLIENT);
  });
});
