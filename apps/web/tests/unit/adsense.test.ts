import { describe, expect, it } from "vitest";
import { adsenseClient, adsenseScriptSrc } from "@/lib/adsense";

describe("AdSense verification snippet (off by default)", () => {
  it("renders nothing when the variable is unset, blank or malformed", () => {
    expect(adsenseClient({})).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "" })).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "   " })).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "pub-5550288003651205" })).toBeUndefined();
    expect(adsenseClient({ UPNEXT_ADSENSE_CLIENT: "ca-pub-1&x=<script>" })).toBeUndefined();
  });

  it("accepts a well-formed publisher id and builds the Google script URL", () => {
    const client = adsenseClient({ UPNEXT_ADSENSE_CLIENT: " ca-pub-5550288003651205 " });
    expect(client).toBe("ca-pub-5550288003651205");
    expect(adsenseScriptSrc(client!)).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5550288003651205",
    );
  });
});
