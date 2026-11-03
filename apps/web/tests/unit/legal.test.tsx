import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { cleanup, render, screen, within } from "@testing-library/react";
import { PRIVACY } from "@/content/legal/privacy";
import { TERMS } from "@/content/legal/terms";
import { OPERATOR, legalPublished } from "@/content/legal/operator";
import type { Block, LegalDocument as Doc } from "@/content/legal/types";
import { LegalDocument } from "@/components/content/legal-document";
import { STATIC_PATHS } from "@/lib/site";
import { readRepoFile } from "./helpers";

const DOCS: Doc[] = [PRIVACY, TERMS];

function allText(doc: Doc): string {
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

describe("legal documents are publication-ready text (no draft presentation)", () => {
  for (const doc of DOCS) {
    const text = allText(doc);

    it(`${doc.slug}: no placeholders, draft wording or developer references`, () => {
      expect(text).not.toMatch(/\[(?!Chapter )[^\]]*\](?!\()/); // [square brackets] that are neither links nor statute citations
      for (const word of [
        "draft",
        "TBD",
        "to be confirmed",
        "lorem",
        "owner to",
        "OQ-",
        "D-4",
        "nextjob",
        "TODO",
      ]) {
        expect(text.toLowerCase(), word).not.toContain(word.toLowerCase());
      }
    });

    it(`${doc.slug}: ids are unique, every in-page and internal link resolves`, () => {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const known = new Set(["/privacy", "/terms", "/contact", "/about", "/employers"]);
      for (const m of text.matchAll(/\]\((\/[^)#]*)(#([^)]*))?\)/g)) {
        expect(known.has(m[1]!), m[0]).toBe(true);
      }
    });

    it(`${doc.slug}: dates are ISO, the version is recorded in the history, and only the confirmed operator facts appear`, () => {
      expect(doc.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.updated >= doc.effective).toBe(true);
      expect(doc.history[0]?.version).toBe(doc.version);
      expect(text).toContain(OPERATOR.legalName);
      expect(text).toContain(OPERATOR.privacyEmail);
      expect(text).toContain(OPERATOR.generalEmail);
      const mailboxes = new Set(
        (text.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/g) ?? []).map((m) => m.replace(/\.$/, "")),
      );
      expect([...mailboxes].sort()).toEqual([OPERATOR.generalEmail, OPERATOR.privacyEmail].sort());
      for (const invented of [
        "Company registration number",
        "registered office",
        "licence number",
        "Data Protection Officer:",
        "Harare",
      ]) {
        expect(text).not.toContain(invented);
      }
    });
  }

  it("the Terms never subscribe anyone to e-mail and promise no payments, applications or candidate search", () => {
    const text = allText(TERMS).toLowerCase();
    expect(text).toContain("never subscribes you to anything");
    expect(text).toContain("we do not receive applications");
    expect(text).toContain("does not currently charge any fees");
    expect(text).toContain("let employers search or view jobseeker profiles");
  });

  it("the Terms cover every required topic", () => {
    const titles = TERMS.sections.map((s) => s.title.toLowerCase()).join(" | ");
    for (const topic of [
      "acceptance",
      "eligibility",
      "account",
      "what upnext does",
      "jobseeker",
      "employer",
      "editorial approval",
      "accuracy",
      "fraudulent",
      "scams",
      "external applications",
      "no guarantee",
      "intellectual property",
      "content you submit",
      "scraping",
      "reporting",
      "suspension",
      "privacy",
      "availability",
      "liability",
      "disputes",
      "changes",
      "contact",
    ]) {
      expect(titles, topic).toContain(topic);
    }
  });
});

describe("policy statements match the implemented settings (code-to-policy accuracy)", () => {
  const settings = readRepoFile("apps/api/config/settings/base.py");
  const num = (name: string): number => {
    const m = new RegExp(`${name}", (\\d+)`).exec(settings);
    expect(m, name).not.toBeNull();
    return Number(m![1]);
  };
  const privacy = allText(PRIVACY);

  it("retention and deletion figures equal the settings", () => {
    expect(num("UPNEXT_DELETION_COOLING_OFF_DAYS")).toBe(14);
    expect(privacy).toContain("**14 days**");
    expect(num("UPNEXT_RETENTION_TOKEN_DAYS")).toBe(7);
    expect(privacy).toMatch(/removed after 7 days/);
    expect(num("UPNEXT_RETENTION_OUTBOX_SENT_DAYS")).toBe(30);
    expect(privacy).toMatch(/30 days after sending/);
    expect(num("UPNEXT_RETENTION_OUTBOX_DEAD_DAYS")).toBe(90);
    expect(privacy).toMatch(/scrubbed after 90 days/);
    expect(num("UPNEXT_RETENTION_REVOKED_SESSION_DAYS")).toBe(30);
    expect(num("UPNEXT_RETENTION_REPORT_CONTACT_DAYS")).toBe(30);
    expect(privacy).toMatch(/Removed 30 days after the report is closed/);
    expect(num("UPNEXT_RETENTION_LISTING_STATS_DAYS")).toBe(365);
    expect(privacy).toMatch(/About twelve months/);
  });

  it("session lifetimes and cookie names equal the settings", () => {
    expect(settings).toContain('UPNEXT_SEEKER_IDLE_SECONDS", 7 * 24 * 3600');
    expect(settings).toContain('UPNEXT_SEEKER_ABSOLUTE_SECONDS", 30 * 24 * 3600');
    expect(settings).toContain('upnext_sid"');
    expect(settings).toContain('upnext_csrf"');
    expect(privacy).toContain("upnext_sid");
    expect(privacy).toContain("upnext_csrf");
    expect(privacy).toContain("upnext-theme");
    expect(settings).toContain('UPNEXT_STAFF_IDLE_SECONDS", 30 * 60');
    expect(settings).toContain('UPNEXT_STAFF_SESSION_SECONDS", 60 * 60 * 8');
  });

  it("the alert ledger period, digest size and backup rotation equal the code", () => {
    expect(readRepoFile("apps/api/alerts/service.py")).toContain("LEDGER_DAYS = 30");
    expect(readRepoFile("apps/api/alerts/service.py")).toContain("MAX_PER_DIGEST = 10");
    expect(privacy).toMatch(/List of listings already sent in alerts[\s\S]*30 days/);
    const prune = readRepoFile("infrastructure/backup/prune.sh");
    expect(prune).toContain("UPNEXT_KEEP_DAILY:-7");
    expect(prune).toContain("UPNEXT_KEEP_WEEKLY:-4");
    expect(prune).toContain("UPNEXT_KEEP_MONTHLY:-3");
    expect(privacy).toContain("7 daily, 4 weekly and 3 monthly");
  });

  it("makes no claim the product does not support", () => {
    const both = `${privacy}\n${allText(TERMS)}`.toLowerCase();
    for (const claim of [
      "google analytics",
      "advertising partner",
      "we sell",
      "machine learning model",
      "payment processor",
      "subscription fee",
    ]) {
      expect(both, claim).not.toContain(claim);
    }
    expect(privacy.toLowerCase()).toContain("it is not artificial intelligence");
    expect(privacy.toLowerCase()).toContain("we do not sell your personal information");
  });
});

describe("publication gate", () => {
  it("is closed unless the owner sets UPNEXT_LEGAL_APPROVED=true", () => {
    expect(legalPublished({})).toBe(false);
    expect(legalPublished({ UPNEXT_LEGAL_APPROVED: "yes" })).toBe(false);
    expect(legalPublished({ UPNEXT_LEGAL_APPROVED: "true" })).toBe(true);
  });
  it("the pages remain in the static path list and carry no draft banner", () => {
    expect(STATIC_PATHS).toContain("/privacy");
    expect(STATIC_PATHS).toContain("/terms");
  });
});

describe("LegalDocument rendering", () => {
  afterEach(cleanup);

  it("shows title, dates, version, contact, anchored sections, a contents list that matches and no draft notice", () => {
    render(<LegalDocument doc={PRIVACY} />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeTruthy();
    expect(screen.queryByTestId("draft-notice")).toBeNull();
    const meta = screen.getByTestId("legal-meta");
    expect(within(meta).getAllByText("29 October 2026", { selector: "time" }).length).toBe(2);
    expect(within(meta).getByText(PRIVACY.version)).toBeTruthy();
    expect(within(meta).getByRole("link", { name: "support@upnext.co.zw" }).getAttribute("href")).toBe(
      "mailto:support@upnext.co.zw",
    );
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.length).toBe(PRIVACY.sections.length + 1); // + version history
    for (const section of PRIVACY.sections) {
      expect(document.getElementById(section.id)).not.toBeNull();
      const links = document.querySelectorAll(`nav a[href="#${section.id}"]`);
      expect(links.length).toBe(2); // desktop and mobile contents lists
    }
    expect(screen.getByTestId("toc-mobile").tagName).toBe("DETAILS");
  });

  it("every table has a caption and column headers", () => {
    render(<LegalDocument doc={PRIVACY} />);
    for (const table of Array.from(document.querySelectorAll("table"))) {
      expect(table.querySelector("caption")?.textContent).toBeTruthy();
      expect(table.querySelectorAll("th[scope=col]").length).toBeGreaterThan(1);
    }
  });
});
