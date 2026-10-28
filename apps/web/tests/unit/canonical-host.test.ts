import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "@/lib/canonical-host";

const url = { pathname: "/opportunities/graduate-engineer", search: "?q=a&category=jobs" };

describe("www to apex redirect (D-42)", () => {
  it("sends www.<domain> to the apex, keeping path and query", () => {
    expect(canonicalRedirect("www.upnext.co.zw", url, "https://upnext.co.zw")).toBe(
      "https://upnext.co.zw/opportunities/graduate-engineer?q=a&category=jobs",
    );
    expect(canonicalRedirect("WWW.UPNEXT.CO.ZW:443", url, "https://upnext.co.zw/")).toBe(
      "https://upnext.co.zw/opportunities/graduate-engineer?q=a&category=jobs",
    );
  });
  it("leaves the apex, other hosts, previews and development alone", () => {
    expect(canonicalRedirect("upnext.co.zw", url, "https://upnext.co.zw")).toBeNull();
    expect(canonicalRedirect("www.example.org", url, "https://upnext.co.zw")).toBeNull();
    expect(canonicalRedirect("www.localhost", url, "http://localhost:8080")).toBeNull();
    expect(canonicalRedirect("www.127.0.0.1", url, "http://127.0.0.1:8080")).toBeNull();
    expect(canonicalRedirect("www.upnext.co.zw", url, undefined)).toBeNull();
    expect(canonicalRedirect("www.upnext.co.zw", url, "not a url")).toBeNull();
    expect(canonicalRedirect(null, url, "https://upnext.co.zw")).toBeNull();
  });
});
