import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { privacyFor, PRIVACY } from "@/content/legal/privacy";
import type { Block, LegalDocument as Doc } from "@/content/legal/types";

function text(doc: Doc): string {
  const parts: string[] = [doc.intro];
  const walk = (b: Block) => {
    if (b.t === "p") parts.push(b.text);
    else if (b.t === "ul" || b.t === "ol") parts.push(...b.items);
    else parts.push(b.caption, ...b.head, ...b.rows.flat());
  };
  for (const s of doc.sections) {
    parts.push(s.title);
    s.blocks.forEach(walk);
  }
  return parts.join("\n");
}
const sectionText = (doc: Doc, id: string) => {
  const s = doc.sections.find((x) => x.id === id)!;
  return text({ ...doc, intro: "", sections: [s] });
};

describe("Privacy Policy and Google AdSense", () => {
  it("the default policy is the no-advertising one", () => {
    expect(PRIVACY).toEqual(privacyFor("off"));
  });

  it("while AdSense is not activated, it does not claim that ads are shown or that Google scripts load", () => {
    const doc = privacyFor("off");
    const ad = sectionText(doc, "advertising");
    expect(ad).toContain("does **not** currently show advertisements");
    expect(ad).toContain("does not load Google’s advertising scripts");
    expect(ad).not.toContain("shows advertisements provided by");
    expect(sectionText(doc, "cookies")).toContain("We do not use advertising, tracking or analytics cookies");
    expect(sectionText(doc, "cookies")).not.toContain("upnext-ad-consent"); // listed in the table only when live
    expect(text(doc)).not.toContain("Advertising: Google AdSense.");
  });

  it("in verification mode it says plainly that a Google script loads and that no ads are shown", () => {
    const doc = privacyFor("verify");
    const ad = sectionText(doc, "advertising");
    expect(ad).toContain("does **not** show advertisements");
    expect(ad).toMatch(/loads? for every visitor, before any choice is offered/);
    expect(sectionText(doc, "cookies")).toContain("the Google script described in section 6A");
    expect(sectionText(doc, "cookies")).not.toContain(
      "We do not use advertising, tracking or analytics cookies,",
    );
  });

  it("when live it discloses AdSense, consent, the footer control and the stored choice", () => {
    const doc = privacyFor("live");
    const ad = sectionText(doc, "advertising");
    expect(ad).toContain("shows advertisements provided by **Google AdSense**");
    expect(ad).toContain("until you allow advertising");
    expect(sectionText(doc, "cookies")).toContain("upnext-ad-consent");
    expect(text(doc)).toContain("Advertising: Google AdSense.");
    expect(text(doc)).not.toContain("we do not use it for advertising,");
    expect(sectionText(doc, "cookies")).toContain("load only if you allow advertisements");
  });

  for (const mode of ["off", "verify", "live"] as const) {
    describe(`required disclosures (${mode})`, () => {
      const doc = privacyFor(mode);
      const ad = sectionText(doc, "advertising");
      it("explains cookies, personalised and non-personalised advertising, and what Google receives", () => {
        expect(ad).toMatch(/cookies, device identifiers and similar technologies/);
        expect(ad).toContain("**personalised**");
        expect(ad).toContain("**non-personalised**");
        expect(ad).toContain("What Google may receive");
        expect(ad).toContain("does not give Google your account details");
      });
      it("links to Google's advertising privacy information and settings, and to opt-out tools", () => {
        for (const url of [
          "https://policies.google.com/privacy",
          "https://policies.google.com/technologies/ads",
          "https://policies.google.com/technologies/partner-sites",
          "https://adssettings.google.com",
          "https://www.youronlinechoices.com",
        ])
          expect(ad, url).toContain(url);
      });
      it("addresses consent for the EEA, the United Kingdom and Switzerland", () => {
        expect(ad).toContain("European Economic Area, the United Kingdom and Switzerland");
        expect(ad).toMatch(/prior consent/);
      });
      it("keeps the earlier disclosures (accounts, retention, security, rights, deletion)", () => {
        const ids = doc.sections.map((s) => s.id);
        for (const id of ["information-we-collect", "security", "retention", "deletion", "your-rights"])
          expect(ids).toContain(id);
        expect(text(doc)).toContain("**14 days**");
        expect(text(doc)).toContain("upnext_sid");
      });
    });
  }

  it("the policy is linked from the site footer and the sign-in footer", () => {
    const root = resolve(__dirname, "../../src/components/layout");
    expect(readFileSync(resolve(root, "site-footer.tsx"), "utf8")).toContain(
      '["/privacy", "Privacy Policy"]',
    );
    expect(readFileSync(resolve(root, "auth-footer.tsx"), "utf8")).toContain('href="/privacy"');
  });

  it("makes no unsupported compliance guarantee", () => {
    for (const mode of ["off", "verify", "live"] as const) {
      const t = text(privacyFor(mode)).toLowerCase();
      for (const claim of ["gdpr compliant", "fully compliant", "certified", "guarantee"])
        expect(t, claim).not.toContain(claim);
    }
  });
});
