# Phase 6B report — jobseeker profile, For You, saved opportunities and job alerts — DRAFT

Status: DRAFT, awaiting owner review. Implemented on branch `claude/nextjob-zimbabwe-phase-6b-30bfc9` from the Phase 6A integration branch `claude/new-session-t9v0fd` (identical at the start: `106ce43`). Authorisation: D-38. Design record: ADR-0023. **Not merged, not deployed. No e-mail was sent; no provider was contacted.** CI result and final commit: see section 9 (filled in after the run).

## 1. What was built
| Area | Result |
|---|---|
| Profile | Optional, private `SeekerProfile` (home city or province, highest qualification, experience, skills, industries, categories, employment types, preferred places, work arrangements). Edit, **reset preferences**, **delete**. Not in Django Admin; no route selects another account; audit records that a change happened, never its content |
| For You | `GET /discovery/for-you` and `/for-you`: deterministic `rules-v1`, every row explained by the signal that ranked it, unknowns and notes shown, open public listings only, no eligibility wording, newest-first fallback. Specification: `docs/engineering/RECOMMENDATION_SPEC.md` |
| Saved | Existing model and API reused. The list now shows open or closed state, a "How to apply on the official site" link for open listings (to the listing's own "How to apply" section, which keeps the handoff wording and the apply counter) and a closed-listing note |
| Alerts | One opt-in alert per account: categories, places, daily or weekly, on or off; recorded consent (time, wording version); ledger so a listing goes out once; worker pass **gated by `delivery_verified()`**; one-click unsubscribe and headers; branded template. Runbook: `docs/engineering/EMAIL_ALERT_RUNBOOK.md` |
| Dashboard | `/dashboard` plus one navigation strip (Overview, For you, Saved, Profile, Alerts) over compact pages built from the existing components; one new header link ("For you") |
| Privacy | Deletion removes profile, alert and ledger and cancels waiting alert mail; a pending deletion request pauses alerts; data inventory, rights procedures, privacy page, role matrix updated |

## 2. Review of the existing project (task step 1)
Read: CLAUDE.md, the decision register, ADR-0019 to 0022, the Phase 5 and 6A reports, the Phase 6B plan, and the accounts, saved, search, outbox, suppression, delivery-gate and Resend code. The Phase 6A integration branch was current. Employer behaviour was left alone (all earlier suites pass, section 5).
**Sitemap stability fix: not identifiable as completed.** No commit, report or decision names a "sitemap stability fix". The only recorded sitemap limitation is Phase 5's: the freshness assertions pass only with the sitemap caches at 0 on test stacks (`PHASE5_REPORT.md` lines 47, 48, 77). It is unchanged and is recorded here as an **outstanding issue**, not fixed. In the full local browser run one unrelated test (`seo.spec.ts` home categories) failed once and passed on its retry; the cause was not established (a transient empty category list from the home page's own API call is the likeliest; the public-read throttle is a candidate on a single-IP local run).

## 3. Departures and provisional decisions
P6B-01 to P6B-12 in the decision register; departures from the readiness plan are in ADR-0023. In short: no double opt-in e-mail (the account address is already confirmed; consent is an explicit recorded action); unsubscribe does not write the address suppression list (it would also block security mail); qualification is compared when the listing states a minimum (equal level only). **There is no existing export workflow**, so none was extended (P6B-12): the profile and alert `GET` endpoints return everything held.

## 4. Outstanding questions for the owner
1. Approve or change P6B-01 to P6B-12, especially the field list, the 30-day ledger, the consent wording and keeping the consent proof after withdrawal.
2. Is an export of personal data wanted before launch (P4-05, P6B-12)?
3. Alert frequency options (daily and weekly built), per-digest cap (10), and whether alerts should later follow saved searches.
4. Whether the dashboard should become the post-sign-in landing page (today it is `/account`, unchanged).

## 5. Verification (executed here, Python 3.14.6, PostgreSQL 16.x, Node 24.22.0; CI uses 3.14.8, PostgreSQL 18.6)
| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check`, `mypy` (strict, 194 files) | pass |
| `makemigrations --check` | no changes; migrations `profiles.0001`, `alerts.0001`, `notifications.0006` |
| `spectacular --validate`; contract tests; endpoint review (new public operation added to the reviewed list) | pass |
| Backend tests and coverage | **681 passed, 94.44 %** (gate 85 %); 84 more than the baseline of 597 (new files `test_profiles.py` 25, `test_foryou.py` 19, `test_alerts.py` 39, plus extended existing suites) |
| Web `eslint`, `tsc`, `prettier --check`, `tokens:check` | pass |
| Web unit tests | **122 passed** (15 new in `seeker.test.tsx`, plus the sign-in redirect allow-list) |
| Production build (`next build`) | pass |
| Playwright, new `seeker-journey.spec.ts` against a local stack (Django, worker, Next production build, same-origin proxy; **no Docker in this environment**) | **13 / 13 passed**: visitor search, registration and profile, preferences, For You updates, save and remove, alert set-up with consent, alert generated to the file spool (not sent) and not duplicated, unsubscribe without signing in, profile reset and deletion, another account cannot read a profile, four widths |
| Playwright, all earlier specs on the same stack (accounts, employer, CMS, a11y, controls, opportunities, SEO, foundation) | 142 passed, 1 flaky (passed on retry, see section 2), 18 skipped (performance budgets and the production-mode-only case need other stacks) |
| Widths 320, 390, 768, 1440 | no horizontal scroll and axe (WCAG 2.2 AA tags) clean on the five seeker pages at 320 and 1440; scroll checked at all four |
| Docs and traceability (`tools/check_docs.py`, regenerated matrix) | pass; R-07, R-08 rewritten, R-47 and R-48 added |
| Secrets scan (`tools/scan-secrets.sh`) | see section 9 |

Bugs the browser tests found and fixed: the new pages were missing from the sign-in redirect allow-list; the header overflowed at 320 px with the extra link (it now wraps); the width test first checked the sign-in page by mistake (it now asserts the page it visits).
Screenshots (full page, local stack, fictional demo data): `docs/phase6b/evidence/` (dashboard at 320, profile at 390, alerts at 768, For you at 1440, saved-in-dashboard, unsubscribe). All 30 were generated per run into a scratch folder.

## 6. Security and privacy review (self-review, not an audit)
Profile and alert views work on `request.user` only; no route carries an account id; cross-account and staff tests; unsubscribe token is signed, kind-bound and can only switch that alert off; unsubscribe is throttled per IP; For You is throttled per user and capped at 500 candidates; alert mail goes only to a confirmed, non-suppressed, non-deleting account; payloads are scrubbed after sending; the audit log holds field names, never values; no personal data in logs.

## 7. Limitations
- No real e-mail was sent or can be: B-01 is open. Message rendering, headers and scheduling are proven with the file and fake senders only. Real Resend behaviour with `List-Unsubscribe` headers is untested.
- The CI browser job runs on the prod-like Compose stack; this environment could not run it, so the new CI step is untested until the draft pull request runs.
- Ranking quality is unmeasured on real data; the demo listings are fictional.
- Manual accessibility testing with assistive technology has not been done (B-10).
- The profile page lists every place as a checkbox (about 30); a search box would be kinder on a phone.

## 8. Remaining launch blockers
All of B-01 to B-10 remain open (`LAUNCH_BLOCKERS.md`). Phase 6B adds dependencies: B-01 gates alerts, B-02 gates collecting profiles and alert consent, B-09 limits what can be judged about For You.

## 9. Pull request, final commit, CI
Filled in after the run (below).
