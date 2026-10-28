import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BRAND, openGraphFor } from "@/lib/brand";
import { absolute, contactEmail, SITE_NAME } from "@/lib/site";
import { websiteFor } from "@/lib/structured-data";

afterEach(() => vi.unstubAllEnvs());

describe("UPNEXT Careers identity (D-42)", () => {
  it("uses the approved names, domain and the one official address", () => {
    expect(BRAND.name).toBe("UPNEXT Careers");
    expect(BRAND.short).toBe("UPNEXT");
    expect(BRAND.descriptor).toBe("Careers");
    expect(BRAND.domain).toBe("upnext.co.zw");
    expect(BRAND.canonicalOrigin).toBe("https://upnext.co.zw");
    expect(BRAND.email).toBe("info@upnext.co.zw");
    expect(SITE_NAME).toBe(BRAND.name);
    expect(contactEmail()).toBe("info@upnext.co.zw");
  });

  it("uses the approved homepage title and description verbatim", () => {
    expect(BRAND.homeTitle).toBe("UPNEXT Careers | Jobs & Opportunities in Zimbabwe");
    expect(BRAND.homeDescription).toBe(
      "Discover jobs and career opportunities in Zimbabwe with UPNEXT Careers. Explore vacancies, internships and other opportunities from trusted sources.",
    );
  });

  it("repeats the site fields on every Open Graph block, with the configured origin in links", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://upnext.co.zw");
    const og = openGraphFor(absolute("/about"), { title: "About UPNEXT Careers" });
    expect(og).toMatchObject({
      siteName: "UPNEXT Careers",
      url: "https://upnext.co.zw/about",
      title: "About UPNEXT Careers",
      type: "website",
    });
    expect(og.description).toBe(BRAND.description);
    expect(og.images[0]).toMatchObject({ url: "/brand/og-image.png", width: 1200, height: 630 });
  });

  it("puts the brand, the logo and the configured origin in structured data", () => {
    vi.stubEnv("UPNEXT_PUBLIC_BASE_URL", "https://upnext.co.zw");
    const site = JSON.stringify(websiteFor(absolute("/").replace(/\/$/, "")));
    expect(site).toContain("UPNEXT Careers");
    expect(site).toContain("https://upnext.co.zw");
    expect(site).toContain("https://upnext.co.zw/brand/icon-512.png");
    expect(site).toContain("info@upnext.co.zw");
    expect(site).not.toMatch(/nextjob/i);
  });

  it("the former name appears nowhere in the public web source", () => {
    const root = resolve(__dirname, "../../src");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const offenders = walk(root)
      .filter((f) => /\.(tsx?|css|svg|json)$/.test(f) && !f.endsWith("brand.ts"))
      .filter((f) => /nextjob/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the brand asset files exist and the logo SVGs are flat black or white only", () => {
    const dir = resolve(__dirname, "../../public/brand");
    for (const file of [
      "upnext-monogram.svg",
      "upnext-monogram-white.svg",
      "upnext-wordmark.svg",
      "upnext-wordmark-white.svg",
      "upnext-lockup.svg",
      "upnext-lockup-white.svg",
      "upnext-nav.svg",
      "upnext-nav-white.svg",
      "favicon.ico",
      "favicon-16.png",
      "favicon-32.png",
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
      "social-profile-400.png",
      "og-image.png",
    ])
      expect(statSync(join(dir, file)).size, file).toBeGreaterThan(100);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".svg"))) {
      const svg = readFileSync(join(dir, file), "utf8");
      const fills = [...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8}|[a-z]+)"/g)].map((m) => m[1]!.toLowerCase());
      for (const fill of fills)
        expect(["#000000", "#ffffff", "#000", "#fff"], `${file} ${fill}`).toContain(fill);
      expect(svg, file).not.toMatch(/gradient|filter|<image|stroke=/i);
    }
  });
});
