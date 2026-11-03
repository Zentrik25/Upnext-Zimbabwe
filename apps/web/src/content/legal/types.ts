/**
 * Legal documents are data, not page code, so that every revision is a reviewable change and the version,
 * effective date and history travel with the text. Inline markup in strings: **bold** and [label](/path).
 */
export type Block =
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "table"; caption: string; head: string[]; rows: string[][] };

export type LegalSection = { id: string; title: string; blocks: Block[] };

export type LegalVersion = { version: string; effective: string; summary: string };

export type LegalDocument = {
  slug: "privacy" | "terms";
  title: string;
  description: string;
  intro: string;
  version: string;
  /** ISO dates (yyyy-mm-dd): when this version takes effect and when the text was last changed. */
  effective: string;
  updated: string;
  sections: LegalSection[];
  history: LegalVersion[];
};
