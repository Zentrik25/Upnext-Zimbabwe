import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let forwarded: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => {
    if (forwarded === "OUTSIDE-REQUEST") throw new Error("headers() was called outside a request scope");
    return new Headers(forwarded ? { "x-forwarded-for": forwarded } : {});
  },
}));

import { listCategories, getSitemapEntries, visitorAddress } from "@/lib/catalog";

afterEach(() => {
  forwarded = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("visitorAddress", () => {
  it("accepts IPv4 and IPv6 addresses as nginx writes them", () => {
    expect(visitorAddress("203.0.113.9")).toBe("203.0.113.9");
    expect(visitorAddress("2001:db8::1")).toBe("2001:db8::1");
  });

  it("uses the last entry, written by the nearest proxy, not one a browser could have added", () => {
    expect(visitorAddress("10.9.9.9, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("refuses anything that is not an address", () => {
    expect(visitorAddress(null)).toBeNull();
    expect(visitorAddress("")).toBeNull();
    expect(visitorAddress("unknown")).toBeNull();
    expect(visitorAddress("203.0.113.9\r\nX-Evil: 1")).toBeNull();
    expect(visitorAddress("<script>")).toBeNull();
  });
});

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof stubFetch>): Record<string, string> {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  return (calls[0]?.[1].headers ?? {}) as Record<string, string>;
}

describe("server-side catalog reads", () => {
  it("pass the visitor's address to the API so the read limit is per visitor", async () => {
    forwarded = "203.0.113.9";
    const fetchMock = stubFetch();
    await listCategories();
    expect(sentHeaders(fetchMock)["X-Forwarded-For"]).toBe("203.0.113.9");
  });

  it("send no address when there is none, or none valid, or no request in scope", async () => {
    for (const value of [null, "garbage", "OUTSIDE-REQUEST"]) {
      forwarded = value;
      const fetchMock = stubFetch();
      await listCategories();
      expect(sentHeaders(fetchMock)["X-Forwarded-For"]).toBeUndefined();
    }
  });

  it("do not attribute the shared, cached sitemap to one visitor", async () => {
    forwarded = "203.0.113.9";
    vi.stubEnv("UPNEXT_SITEMAP_CACHE_SECONDS", "300");
    const fetchMock = stubFetch();
    await getSitemapEntries();
    expect(sentHeaders(fetchMock)["X-Forwarded-For"]).toBeUndefined();
  });
});
