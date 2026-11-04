import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/ads.txt/route";
import { adsTxtFor } from "@/lib/adsense";

const CLIENT = "ca-pub-1234567890123456"; // a syntactically valid TEST value, not a real publisher id

afterEach(() => vi.unstubAllEnvs());

describe("/ads.txt", () => {
  it("builds Google's single authorising line: no ca- prefix, DIRECT, Google's fixed certification id", () => {
    expect(adsTxtFor(CLIENT)).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("answers 404 as plain text while no publisher id is configured (nothing is published by default)", async () => {
    vi.stubEnv("UPNEXT_ADSENSE_CLIENT", "");
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await response.text()).not.toContain("google.com");
  });

  it("answers 404 for a malformed id", () => {
    vi.stubEnv("UPNEXT_ADSENSE_CLIENT", "pub-123");
    expect(GET().status).toBe(404);
  });

  it("serves the line as plain text once the owner sets the id, whatever the mode", async () => {
    vi.stubEnv("UPNEXT_ADSENSE_CLIENT", CLIENT);
    vi.stubEnv("UPNEXT_ADSENSE_MODE", ""); // the ads.txt method needs no Google script, so no mode
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });
});
