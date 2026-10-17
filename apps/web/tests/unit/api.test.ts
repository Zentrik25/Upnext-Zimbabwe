import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getApiRoot } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("getApiRoot", () => {
  it("returns the parsed API root", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ name: "UPNEXT API", version: "v1", status: "ok" }))),
    );
    expect(await getApiRoot()).toEqual({
      ok: true,
      data: { name: "UPNEXT API", version: "v1", status: "ok" },
    });
  });
  it("calls the internal URL without cookies or caching", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await getApiRoot();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/$/);
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBeUndefined();
  });
  it("reports unexpected responses and unreachable service without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ nope: 1 }))),
    );
    expect(await getApiRoot()).toEqual({ ok: false, reason: "unexpected-response" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    expect(await getApiRoot()).toEqual({ ok: false, reason: "unreachable" });
  });
});
