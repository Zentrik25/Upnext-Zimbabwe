# Career guide drafts (AdSense audit 2026-11-14) — DRAFT, NOT PUBLISHED

Status: DRAFT. Nothing in this folder is on the public site. Each file is a proposed revision of a live guide, or a
proposed new guide, written for the owner's editorial review (D-51 (3), D-72 (4), CLAUDE.md rule 6). Publication
needs that review and then a code change that replaces the page text; it must not be pasted live unreviewed.

## Why these drafts exist

The live guides are accurate but describe mostly UPNEXT's own features (filters, labels, saving). For a reader they
add little that a Zimbabwean job seeker could not learn from the search page itself, which weakens the "authentic,
high-quality information" test in the AdSense rejection of 14 November 2026. The drafts keep everything true from the
current guides and add practical, Zimbabwe-specific help: how vacancies are actually advertised here, how to check
one, what the common requirements mean, and worked examples taken from the kind of notices UPNEXT publishes.

## Rules followed

- No invented facts, figures, laws, URLs or quotations. Any statement the writer could not confirm from this
  repository or from widely known public facts is marked **[VERIFY]** and must be checked against a primary source
  (the Act, the regulator's own site, the institution's own handbook) before publication, or removed.
- No reference links are given as URLs: the editor adds each link after opening it and confirming it is the official
  source. The "References to confirm" list in each draft says what to look for.
- Examples describe real notice patterns seen on the live site in November 2026 without naming the employer, so a
  guide does not go stale when a listing closes.
- UK English, plain words, no filler. Each draft is meant to replace, not sit beside, the current page.

## Editorial checklist (per guide)

1. Every **[VERIFY]** resolved (confirmed with a source, or the sentence removed).
2. Reference links added and opened by the editor; only official or primary sources.
3. Read once against the live listings: no promise the product does not keep (for example, no promise that every
   listing shows a source; see D-74).
4. Reviewed by someone other than the writer (D-18 spirit for editorial text).
5. Owner approval recorded in the decision register; then the page text and `dateModified` in
   `apps/web/src/lib/guides.ts` are updated in one reviewed commit.

| Draft | Replaces / adds | Live path (unchanged) |
|---|---|---|
| `01-how-to-find-legitimate-jobs-in-zimbabwe.md` | replaces "How to find jobs in Zimbabwe" | `/guides/how-to-find-jobs-in-zimbabwe` |
| `02-how-to-verify-a-recruitment-advertisement.md` | new; complements "apply safely" | proposed `/guides/how-to-verify-a-recruitment-advertisement` |
| `03-preparing-a-cv-for-zimbabwean-employers.md` | replaces "How to prepare a CV" | `/guides/how-to-prepare-a-cv` |
| `04-graduate-trainee-applications.md` | replaces "How to apply for graduate trainee programmes" | `/guides/how-to-apply-for-graduate-trainee-programmes` |
| `05-engineering-internships-and-attachments.md` | replaces "Where to find engineering internships and attachments" | `/guides/finding-engineering-internships-and-attachments` |
| `06-understanding-job-application-requirements.md` | new | proposed `/guides/understanding-job-application-requirements` |

Existing public URLs are kept; the two new guides need new paths, which the owner approves with the text.
