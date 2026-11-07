import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adAllowedOn, isAdEligiblePath, placementForPath } from "@/lib/ad-rules";

const src = resolve(__dirname, "../../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? files(f) : [f];
  });

describe("where advertisements may appear (allow-list)", () => {
  it("allows a single opportunity page and the guides", () => {
    expect(placementForPath("/opportunities/senior-accountant-k7m3qp")).toBe("job-detail");
    expect(placementForPath("/guides/how-to-find-jobs-in-zimbabwe")).toBe("guide");
    expect(adAllowedOn("job-detail", "/guides/how-to-find-jobs-in-zimbabwe")).toBe(false);
    expect(adAllowedOn("guide", "/opportunities/x")).toBe(false);
  });

  it("never allows functional, account, legal, staff or listing-index pages", () => {
    for (const path of [
      "/",
      "/opportunities",
      "/opportunities/some-job/report",
      "/sign-in",
      "/sign-in/two-step",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/accept-invitation",
      "/account",
      "/account/security",
      "/account/delete",
      "/saved",
      "/dashboard",
      "/alerts",
      "/alerts/unsubscribe",
      "/profile",
      "/for-you",
      "/employer",
      "/employer/claim",
      "/employer/listings/new",
      "/employers",
      "/employers/register",
      "/employers/some-org",
      "/workspace",
      "/workspace/opportunities/1/preview",
      "/privacy",
      "/terms",
      "/contact",
      "/about",
      "/design-system",
      "/guides",
    ])
      expect(isAdEligiblePath(path), path).toBe(false);
  });

  it("ad slots are placed only in the opportunity page and the guide layout", () => {
    const users = files(src)
      .filter((f) => /\.tsx$/.test(f) && !f.includes("/components/ads/"))
      .filter((f) => /<AdSlot\b/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(src.length + 1));
    expect(users.sort()).toEqual(["app/opportunities/[slug]/page.tsx", "components/content/guide-page.tsx"]);
  });

  it("no layout, header, footer, bottom navigation or form page uses an ad slot", () => {
    for (const f of files(src).filter((f) => /(layout|header|footer|nav|form|workspace|account)/i.test(f))) {
      if (!/\.tsx$/.test(f)) continue;
      // Also no import of the ad components: Next ships every client component a page can reach, so an import from
      // shared layout code would weigh on every page, ads on or off (mobile script budget, P5-08).
      expect(readFileSync(f, "utf8"), f).not.toMatch(/<AdSlot\b|<AdUnit\b|from ["'][^"']*components\/ads/);
    }
  });

  it("on the job page the slot sits after the description, clear of the apply, save and share controls", () => {
    const view = readFileSync(join(src, "components/opportunities/job-view.tsx"), "utf8");
    const at = (needle: string) => {
      const i = view.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const apply = at('data-testid={canApply ? "apply"');
    const share = at("<ShareButton");
    const description = at("listing.description_html ?");
    const ad = at("{!preview ? ad : null}");
    const howTo = at('id="how-to-apply"');
    expect(ad).toBeGreaterThan(Math.max(apply, share, description));
    expect(ad).toBeLessThan(howTo);
    expect(view).not.toMatch(/<ApplyActions[^>]*\bad\b/);
  });
});
