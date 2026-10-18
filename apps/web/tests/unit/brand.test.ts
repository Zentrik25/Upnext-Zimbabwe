import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BRAND, openGraphFor } from "@/lib/brand";
import { absolute, mailboxes, SITE_NAME } from "@/lib/site";
import { websiteFor } from "@/lib/structured-data";

afterEach(() => vi.unstubAllEnvs());

describe("NextJob Zimbabwe identity (D-33)", () => {
  it("uses the approved names and never the former one", () => {
    expect(BRAND.name).toBe("NextJob Zimbabwe");
    expect(BRAND.short).toBe("NextJob");
    expect(BRAND.tagline).toBe("Find what's next.");
    expect(SITE_NAME).toBe(BRAND.name);
    expect(JSON.stringify(BRAND)).not.toMatch(/upnext/i);
  });

  it("repeats the site fields on every Open Graph block, with the configured origin in links", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://nextjob.co.zw");
    const og = openGraphFor(absolute("/about"), { title: "About NextJob Zimbabwe" });
    expect(og).toMatchObject({
      siteName: "NextJob Zimbabwe",
      url: "https://nextjob.co.zw/about",
      title: "About NextJob Zimbabwe",
      type: "website",
    });
    expect(og.description).toBe(BRAND.description);
  });

  it("puts the brand and the configured origin in structured data", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://nextjob.co.zw");
    const site = JSON.stringify(websiteFor(absolute("/").replace(/\/$/, "")));
    expect(site).toContain("NextJob Zimbabwe");
    expect(site).toContain("https://nextjob.co.zw");
    expect(site).not.toMatch(/upnext/i);
  });

  it("shows only the mailboxes that are configured", () => {
    for (const name of [
      "UPNEXT_CONTACT_EMAIL",
      "UPNEXT_SUPPORT_EMAIL",
      "UPNEXT_JOBS_EMAIL",
      "UPNEXT_PARTNERSHIPS_EMAIL",
    ]) {
      vi.stubEnv(name, "");
    }
    expect(mailboxes()).toEqual([]);
    vi.stubEnv("UPNEXT_SUPPORT_EMAIL", " support@nextjob.co.zw ");
    expect(mailboxes()).toEqual([{ purpose: "Support and account help", email: "support@nextjob.co.zw" }]);
  });
});
