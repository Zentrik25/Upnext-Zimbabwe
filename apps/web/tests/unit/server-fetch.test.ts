import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchRead } from "@/lib/server-fetch";

const URL_WITH_QUERY = "http://api:8000/api/v1/opportunities?q=secret-search-term";
const ok = () => new Response("{}", { status: 200 });
/** What undici throws when the server closed a pooled keep-alive connection. */
const socketError = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchRead: one retry on a fresh connection for a network-level failure", () => {
  it("makes a single request when it works", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchRead(URL_WITH_QUERY, { cache: "no-store" });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once when a closed keep-alive connection fails the first request", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(socketError()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchRead(URL_WITH_QUERY, { signal: AbortSignal.timeout(4000) });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a request that has already timed out", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRead(URL_WITH_QUERY, { signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after one retry, throws the last error, and logs the path and error codes only", async () => {
    const fetchMock = vi.fn().mockRejectedValue(socketError());
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRead(URL_WITH_QUERY, {})).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("/api/v1/opportunities");
    expect(line).toContain("UND_ERR_SOCKET");
    expect(line).not.toContain("secret-search-term"); // no query string in logs
  });
});
