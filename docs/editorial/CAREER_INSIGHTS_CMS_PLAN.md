# Career Insights CMS: implementation plan — DRAFT

> **2026-11-14:** implemented as D-78 (DRAFT) on the owner's brief, which places the blog at `/insights` (O-14) and keeps the guides at `/guides`. Current description: `CAREER_INSIGHTS_CMS.md`.

Status: DRAFT for the owner's approval. The owner chose a full article CMS on 2026-11-14 (O-11, D-75) instead of
more hard-coded guide pages. **This is a plan only: nothing here is built, migrated or published.** Building it needs
the owner's approval of this plan; each phase ends at a review gate (CLAUDE.md rule 8). Article content still needs
editorial review before publication (D-74), and nothing is published automatically.

Requirements as given by the owner: headline, summary, rich-text body, reader aids, categories, tags, featured
images, publishing workflow, SEO metadata and public article pages. No fuller specification exists in the repository
(searched 2026-11-14); where this plan interprets a requirement it says so and lists the question in §14.

## 1. Principles

- **Reuse, do not duplicate.** The listing CMS already has what articles need: the visual rich-text editor and its
  escape-first Markdown renderer (D-71), the Media Library (D-62), the revision and review workflow with database
  triggers (D-18, D-22, D-46), the audit log, the staff workspace shell (D-49), Article and BreadcrumbList data
  (`articleFor`, `breadcrumbFor`), the sitemap and the D-73 public design.
- **Same editorial guarantees as listings.** Nobody approves their own article; a material change after approval
  needs a new approval; every transition is recorded and re-checked in the database.
- **URLs stay.** The six guides keep `/guides/<slug>`; new articles use the same pattern. "Career Insights" is the
  section's name, not a new route (O-14 if the owner wants `/insights`).
- **Server-rendered.** Article pages and lists are complete in the first HTML (D-74); nothing depends on JavaScript
  except the editor.

## 2. Requirement → design

| Requirement | Design |
|---|---|
| Headline | `headline`, 10–110 characters, unique among published articles; the page's only `<h1>` |
| Summary | `summary`, 50–300 characters, plain text: the standfirst under the headline, the default meta description, the card text on `/guides` |
| Rich-text body | Markdown subset of VALIDATION_SPEC §5 (bold, italic, `++underline++`, lists, links, https only) **plus** level-2 and level-3 headings, block quotes, and two callouts (`> [!TIP]`, `> [!WARNING]`) rendered by the same escape-first renderer, never raw HTML; edited in the D-71 visual editor extended with heading and callout buttons |
| Reader aids *(interpreted, §14 Q1)* | (a) **Key takeaways**: 2–5 short points shown in a box after the summary; (b) **Who this is for**: one line; (c) **On this page**: table of contents generated from the body's level-2 headings (not typed); (d) **Reading time**: computed from the body at 200 words a minute, shown, never a target; (e) **Sources and further reading**: a list of references (title, publisher, https URL, date accessed), required when the body states facts from outside UPNEXT; (f) **Last reviewed** date: set when an editor re-approves the article unchanged after checking it is still accurate |
| Categories | One **primary topic** from a fixed list (Finding work, Applying, CVs and interviews, Graduate and entry level, Internships and attachments, Workplace rights, Funding and tenders) plus any of the six **opportunity categories** it serves; the latter drive "Career resources" on the lists (D-74) and the related listings on the article page |
| Tags | Free tags managed by Administrators (like sectors), at most 8 per article; tag pages are **not** created until a tag holds at least 3 published articles (no thin pages), and are `noindex` below that |
| Featured images | Chosen from or uploaded to the existing Media Library (content-checked, metadata stripped, re-encoded; D-58, D-62); alt text required; optional separate sharing image; none invented; the standard UPNEXT sharing image otherwise |
| Publishing workflow | §5 |
| SEO metadata | Optional SEO title (≤ 60) and description (≤ 160), defaulting to headline and summary; canonical `/guides/<slug>`; Open Graph and Twitter cards; Article and BreadcrumbList JSON-LD with `datePublished` and `dateModified` equal to the visible dates; no FAQ markup; sitemap entry with real `lastmod`; never sent to the Indexing API (Google allows it only for JobPosting) |
| Public article pages | §8 |

## 3. Data model (new Django app `insights`)

| Table | Purpose | Notes |
|---|---|---|
| `Article` | Identity: slug (immutable once published), status (draft, published, withdrawn, archived), live and pending revision, first and last published, last reviewed | Mirrors `Opportunity` |
| `ArticleRevision` | Versioned content: headline, summary, body (Markdown), key takeaways (JSON array), audience line, primary topic, opportunity categories, tags, featured and sharing image, SEO fields, author, submitted by, approved by, content hash, state | Frozen after submission (trigger like `upnext_child_of_draft_only`) |
| `ArticleReference` | Sources and further reading per revision | https only; frozen with the revision |
| `ArticleReview` | Append-only review decisions with the reviewed content hash and the fact-check checklist | Trigger: reviewer is not an author or submitter |
| `ArticleEvent` | Append-only publishing history | Like `PublishingEvent` |
| `Topic`, `Tag` | The fixed topic list (seeded) and Administrator-managed tags | Like `Sector` |

Migrations are additive; no existing table changes.

## 4. Permissions (no new role; no Publisher role, D-23)

| Permission | Contributor | Editor | Administrator |
|---|---|---|---|
| `article.draft` (create, edit own draft, submit) | yes | yes | yes |
| `article.review` (approve, reject, return; not own) | — | yes | yes |
| `article.publish` (publish an approved revision) | — | yes | yes |
| `article.withdraw` | — | yes | yes |
| `taxonomy.tags.manage` | — | — | yes |

Direct publication of one's own article (the D-46 exception for listings) is **not** offered: the owner asked that
editorial content be reviewed before publication. §14 Q3 asks whether that should change.

## 5. Workflow

```
draft ──submit──▶ in review ──approve (another person)──▶ approved ──publish──▶ published
  ▲                  │ return / reject                         │ material change    │ amend
  └──────────────────┘                                         ▼                    ▼
                                                        back to draft        new draft revision
published ──withdraw──▶ withdrawn (page answers 410 or a notice; owner choice §14 Q4)
published ──re-approve unchanged──▶ "last reviewed" date set (accuracy check)
```

- **Review checklist (required to approve):** facts checked against the listed sources; every `[VERIFY]` resolved;
  no invented statistics, quotations or legal statements; links open the stated source; reader aids match the body;
  images have alt text and rights; legal-topic articles (primary topic *Workplace rights*) carry the legal reviewer's
  confirmation.
- **Material change** (headline, summary, body, takeaways, references, categories) clears the approval; a change to
  tags, images or SEO fields alone does not need a new review but is recorded (same rule as listing metadata, D-56).
- Preview of any revision for staff, `noindex`, never cached.
- Every transition audited; database triggers enforce author ≠ reviewer and approval of the exact content hash.

## 6. Staff interface (`/workspace/insights`, D-45 workspace design)

List with filters (status, topic, author, needs review, review due); editor (headline, summary, body with the
extended visual editor, takeaways, audience, references, categories, tags, images, SEO with live length counters and
a search-result preview); side panel with the article's state, history and actions; review screen showing the
checklist and a diff against the live revision. Dashboard tile: articles awaiting review and articles not reviewed
for 12 months.

## 7. API

Public: `GET /api/v1/articles` (published, filter by topic, category, tag; cursor pages), `GET /api/v1/articles/{slug}`,
`GET /api/v1/topics`, and the sitemap feed gains articles. Staff: CRUD on drafts, `submit`, `approve`, `reject`,
`return`, `publish`, `withdraw`, `amend`, preview, references, tags. All documented in `openapi.yaml` before
implementation; field errors in the existing format; CSRF and session as for staff listing endpoints.

## 8. Public pages

- **`/guides`** becomes the Career Insights index: featured article, then articles by topic, each card with headline,
  summary, reading time and updated date; server-rendered; one list page per topic only when it has at least 3
  articles (otherwise no page).
- **Article page `/guides/<slug>`** in this order: breadcrumb; headline (`<h1>`); summary; byline ("UPNEXT Careers
  editorial team"; named authors only if the owner wants them, §14 Q2); published, updated and last reviewed dates;
  featured image; key takeaways; who this is for; on this page; body; sources and further reading; **related open
  opportunities** in the article's categories (live links, as on category pages); related articles; "Report an error
  in this article" (to the contact route); a mid-article ad slot only after AdSense approval and only where
  `ad-rules.ts` allows it.
- D-73 public design, light only; headings and callouts meet contrast; no horizontal scroll at 320 px.

## 9. Moving the six existing guides

1. Seed the six guides as published articles with their current slugs, text and dates (a data migration that a
   second person approves like any article: no automatic publication of changed text).
2. Run both renderings in tests until the CMS version matches the static page (headings, links, dates, JSON-LD).
3. Remove the static `app/guides/*/page.tsx` files; URLs, canonicals and sitemap entries are unchanged, so no
   redirect is needed.
4. The six reviewed drafts in `docs/editorial/drafts/` then go through the CMS workflow as amendments.

## 10. Security

Escape-first renderer (no HTML pass-through; the sanitiser corpus of the listing renderer extended to headings,
quotes and callouts); https-only links with `rel="nofollow noopener"` for external ones; image uploads through the
existing Media Library pipeline; CSRF on every write; staff sessions with two-step proof (D-49, D-59); rate limits on
writes; nothing from article content enters `dangerouslySetInnerHTML` except the server's rendered HTML.

## 11. Tests (traceability IDs proposed)

| ID | What |
|---|---|
| INS-01 | Workflow: author cannot approve; approval binds the content hash; material change clears approval; triggers refuse bypasses |
| INS-02 | Renderer: the subset plus headings, quotes and callouts; XSS corpus; https-only links |
| INS-03 | Reader aids: table of contents from level-2 headings; reading time computed; takeaways 2–5; references required when flagged |
| INS-04 | Public API and pages: only published revisions; first HTML complete without JavaScript; dates visible and equal to JSON-LD |
| INS-05 | SEO: canonical, metadata defaults, sitemap `lastmod`, no FAQ markup, tag and topic pages only above the threshold, never queued for the Indexing API |
| INS-06 | Guide migration parity: each of the six pages renders the same headings, links and dates before and after |
| INS-07 | Staff UI: permissions, validation messages, keyboard and screen-reader use of the editor, axe at four widths |

## 12. Phases and gates

| Phase | Scope | Gate |
|---|---|---|
| C1 | Model, migrations, triggers, workflow service, permissions, staff API, renderer extensions; INS-01, INS-02 | Owner review of model and workflow |
| C2 | Staff editor and review screens; INS-07 | Editors try it on staging data |
| C3 | Public API, article page, `/guides` index, SEO, sitemap; INS-03 to INS-05 | Owner review of the public page |
| C4 | Migrate the six guides; remove static pages; INS-06 | Parity confirmed |
| C5 | Editorial: publish reviewed drafts and P1 articles of `CAREER_INSIGHTS_LAUNCH_PLAN.md` through the workflow | Each article approved by a second person |

Deployment of any phase needs the owner's separate approval (Phase 7 rules).

## 13. Effort (relative)

C1 large; C2 large (editor extensions and review diff); C3 medium; C4 small; C5 editorial, ongoing. The workflow and
editor reuse keep C1 and C2 well below building them anew.

## 14. Questions for the owner

1. **Reader aids:** are key takeaways, who this is for, on this page, reading time, sources and last reviewed the
   right set? Anything else (for example a short glossary box)?
2. **Bylines:** team byline only, or named authors and reviewers?
3. **Direct publication:** keep review mandatory for every article (this plan), or allow the D-46 exception?
4. **Withdrawn articles:** answer 410 Gone, or keep the page with a notice?
5. **Path:** keep `/guides/<slug>` (this plan) or move to `/insights/<slug>` with permanent redirects (O-14)?
6. **Topics:** confirm the seven primary topics in §2.
7. **Review cycle:** 12 months between accuracy reviews, or another period?
