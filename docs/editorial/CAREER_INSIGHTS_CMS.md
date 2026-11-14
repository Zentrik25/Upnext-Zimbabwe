# Career Insights blog and editorial CMS — DRAFT (D-78)

Status: **DRAFT** until the owner approves it. Implemented on branch `ccr-5a8bc1d8-ynu2rf`; not merged, not deployed.
No article has been written or published by this change. The plan it implements is
`CAREER_INSIGHTS_CMS_PLAN.md`; where the owner's brief of 2026-11-14 differs (the `/insights` address), the brief wins
and D-78 records it.

## 1. What exists

| Area | Where |
|---|---|
| Data, workflow, sanitiser | `apps/api/insights/` (models, `services.py`, `sanitize.py`, `public.py`, migrations 0001–0002) |
| API | `apps/api/api/insights_views.py`; 6 public and 15 staff operations in `docs/engineering/openapi/openapi.yaml` |
| Permissions | `insights.write` (Contributor, Editor), `insights.review` and `insights.publish` (Editor, Administrator), `insights.manage` (Administrator); `docs/engineering/ROLE_PERMISSION_MATRIX.md` |
| Staff interface | `/workspace/insights` (list and filters), `/new`, `/[id]/edit`, `/[id]/preview`, `/categories`, `/authors` |
| Editor | `apps/web/src/components/workspace/insights/` (Tiptap 3.32.2: bold, italic, underline, H2, H3, paragraph, bulleted and numbered lists, quote, link and unlink, image from the Media Library with alt text, table, clear formatting, undo and redo) |
| Public pages | `/insights`, `/insights/[slug]`, `/insights/category/[slug]`, `/insights/author/[slug]` |
| Discovery | sitemap, home page section, opportunity category lists, job pages (`RelatedInsights`) |

## 2. Data model

`Article` keeps two copies:

- the **working copy** (headline, summary, body, reader aids, category, sources, featured image, related job categories,
  tags, URL, search and social fields) that writers edit; and
- the **live snapshot** (`live` JSON plus indexed `live_*` columns) that the public reads. It changes only on
  publication, and only to the exact content that was approved.

`content_hash` covers the **material** fields (headline, summary, body, reader aids, category, sources, image and its
alt text, caption and credit, related job categories). `approved_hash` records what the reviewer approved; publication
is refused if they differ. A material change after approval returns the article to Draft; a non-material change
(tags, search and social text, canonical URL) keeps the approval.

Other tables: `ArticleCategory` (database managed, seven seeded), `ArticleTag` (normalised: "CV", "cv" and " Cv " are
one tag), `AuthorProfile`, `ArticleSlugRedirect`, `ArticleReview` and `ArticleEvent` (append-only, enforced by
database triggers and by `provision_db_roles`).

## 3. Workflow and separation of duties (D-18, D-22, D-23)

```
Draft → Submitted → In review → Approved → Published → Archived
          ↑            │            │
          └─ Returned / Rejected (note required)
```

- Nobody reviews or approves an article they wrote, created or submitted: checked in `services._reviewer` and by the
  trigger `insights_review_not_author`.
- Approval requires all ten checklist items: accuracy, originality, source quality, reader usefulness, clarity,
  formatting, image rights, internal links, search metadata, publication readiness.
- Submission requires a summary of at least 30 characters, a body of at least 50 words, a category, and alt text when
  there is a featured picture.
- Saves carry `expected_row_version`; a stale save is refused with a conflict and the editor offers to reload.
  The editor autosaves drafts every 15 seconds and warns before leaving with unsaved changes.
- Every transition writes an `ArticleEvent` and an audit record.

## 4. Security

- **XSS**: the body is sanitised on every save with nh3 (allow-list: p, br, h2, h3, strong, em, u, ul, ol, li,
  blockquote, a, img, table elements; links https, mailto or same-site; pictures https or Media Library). The browser
  renders the stored body through a second allow-list renderer (`apps/web/src/lib/article-html.tsx`) and never uses
  `dangerouslySetInnerHTML` (VALIDATION_SPEC §5). Plain-text fields refuse markup.
- **Mass assignment**: the save endpoint reads a fixed list of fields; status, approvals, hashes, authorship and live
  fields cannot be set by a request.
- **Concurrency**: row version on saves; `select_for_update` on every transition.
- Images and the social picture are Media Library names, never arbitrary URLs.

## 5. Placement and access

Featured, Editors' picks (a scrolling row; nothing moves on its own) and Top story are real flags read by `/insights`
and the home page, and may be set only on a live article. There is **no paywall or access selector**: every published
article is free to read. There is no newsletter sign-up (e-mail delivery is unverified, B-01) and no "most read" list
(no analytics are collected for articles, so a popularity figure would be invented).

## 6. Search engines

| Address | Indexing |
|---|---|
| `/insights` | indexed once an article is published; noindex while empty |
| `/insights?q=`, `?tag=`, `?page=N` | noindex, follow; canonical `/insights` |
| `/insights/<slug>` | indexed; canonical to itself or to the editor's canonical URL; old slugs redirect permanently (308) |
| `/insights/category/<slug>` | indexed only while it holds a published article; later pages noindex, canonical to themselves |
| `/insights/author/<slug>` | exists only for a public profile with at least three published articles |

Articles carry `Article` and `BreadcrumbList` JSON-LD with the real publication and last-material-change dates.
The sitemap adds the Insights home, articles, non-empty categories and author archives only once an article is
published. Google for Jobs and the Indexing API are untouched (articles are not JobPostings).

## 7. The six existing guides (no duplication)

The guides stay hand-written pages at their addresses; nothing is copied into the CMS, so no text exists twice.

| Guide | Address (unchanged) | Shown in Career Insights as | Possible later move |
|---|---|---|---|
| How to find jobs in Zimbabwe | `/guides/how-to-find-jobs-in-zimbabwe` | Featured guides | Career Advice |
| How to apply safely and avoid recruitment scams | `/guides/apply-safely-and-avoid-scams` | Featured guides | Career Advice |
| How UPNEXT Careers checks and verifies listings | `/guides/how-listings-are-verified` | Featured guides | stays a guide (policy page) |
| How to apply for graduate trainee programmes | `/guides/how-to-apply-for-graduate-trainee-programmes` | Featured guides | Graduates & Internships |
| How to prepare a CV for employers in Zimbabwe | `/guides/how-to-prepare-a-cv` | Featured guides | CVs & Interviews |
| Where to find engineering internships and attachments | `/guides/finding-engineering-internships-and-attachments` | Featured guides | Graduates & Internships |

If the owner later wants a guide moved into the CMS, the article must keep the `/guides/...` address by a permanent
redirect from the old page to the new one, the static page is then removed in the same change, and the planned
article on the same subject (editorial plan) is merged into it rather than published separately.

## 8. Navigation

The public header keeps five places (D-73); the fourth is now **Career Insights** (its home lists every guide). The
phone menu and the footer link both Career Insights and the guides; the bottom bar's "Insights" tab is active on
`/insights` and `/guides`. The workspace sidebar shows Career Insights to anyone with an insights permission.

## 9. Verification performed (2026-11-14)

| Check | Result |
|---|---|
| API: `pytest tests/test_insights.py` and the full suite, ruff, mypy, migrations check | see the pull request description |
| Web: vitest (671 tests incl. `insights.test.tsx`), `tsc`, eslint, prettier, `next build` | passed |
| `npm audit` | 0 vulnerabilities |
| Workflow end to end on a local stack (create, save, submit, approve, publish, placement) | passed, fictional data only |
| axe-core (WCAG 2.0–2.2 A/AA) on `/insights`, an article, a category and a search at 320, 390, 768, 1440 px | no serious or critical findings; no horizontal scroll |
| axe-core on `/workspace/insights` and the editor | one finding outside this change: the existing workspace account-menu button (`label-content-name-mismatch`) |

Screenshots (fictional sample data, local only): `screenshots/insights/`.

Not done: Playwright e2e specs for the editor in CI (the checks above were run by hand); the twelve articles.

## 10. What the owner still decides

1. Approve D-78 and this document (both DRAFT).
2. Merge the pull request (separate approval) and deploy with the migration (separate deployment approval).
3. Who writes and who reviews the twelve articles (`CAREER_INSIGHTS_EDITORIAL_PLAN.md`), and the author profiles'
   wording (only what each author confirms).
