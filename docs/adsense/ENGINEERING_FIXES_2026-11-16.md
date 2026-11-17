# AdSense audit engineering fixes, 2026-11-16 (D-79) — handoff

Status: DRAFT (D-79), not merged, not deployed. Nothing was changed on the live site or in the production database from this session (no server access; the live site was not reachable from the build environment). No AdSense review was requested and Google approval is **not** claimed.

## 1. What changed

| Area | Change | Where |
|---|---|---|
| Merge duplicates | T16 `merge_duplicate`: archive the duplicate as `merged`, keep its revisions, sources, verification records and history, append-only redirect row, saved copies move to the kept listing, audit on both listings, `URL_DELETED` queued when indexing records | `apps/api/opportunities/workflow.py`, `models.py`, migration `0013_listing_redirects.py`, `indexing/service.py` |
| One-hop redirect | API answers a retired address with the kept listing; the page and the report form answer 308 to the canonical address (any case, query dropped) | `apps/api/opportunities/public.py`, `api/public_views.py`, `apps/web/src/app/opportunities/[slug]/report/page.tsx` (the detail page already redirected) |
| Cleanup command | `merge_duplicate_listings`: dry run by default, `--apply --actor --evidence`, rerun-safe, `--scan` | `apps/api/opportunities/management/commands/merge_duplicate_listings.py` |
| Prevention | Issuer reference and specific address identity (tracking parameters stripped), hard only with compatible titles, never published directly, advisory locks at submit/publish/import, import refuses repeats; "Harare" = "Harare, Zimbabwe" | `apps/api/opportunities/duplicates.py`, `workflow.py`, `importer.py`, staff detail warning in `api/staff_views.py` |
| Career Insights | Guides are the main content while no article is published; no placeholder; no article search; still `noindex, follow` | `apps/web/src/app/insights/page.tsx` |
| AdSense | `google-adsense-account` meta tag; job ad only on open listings with a description; consent withdrawal / leaving an ad page pauses requests | `apps/web/src/lib/adsense.ts`, `app/layout.tsx`, `app/opportunities/[slug]/page.tsx`, `components/ads/ad-unit.tsx` |
| Verification script | Read-only public checks for everything below | `infrastructure/scripts/verify-adsense-fixes.sh` |
| Records | D-79, ADR-0027, traceability R-79 (DUP-01…04, ADS-05…07), AdSense verification doc update | `docs/` |

## 2. Production cleanup (after the owner approves merge and deployment, Phase 7)

Run on the server from `infrastructure/compose`, with the same Compose files and env file the release uses (`dc` below means `docker compose --env-file <env> -f compose.production.yaml [-f compose.production.edge.yaml]`).

1. **Back up** (the existing backup job) and note the release being replaced.
2. **Deploy** the release with `infrastructure/deploy/release.sh <tag>`; it runs migration `opportunities 0013` (additive: one table, one trigger, a new choice value).
3. **Find every identifier pair** (read-only):
   `dc exec api python manage.py merge_duplicate_listings --scan`
4. **Dry run each pair** (read-only; nothing is written; exits non-zero when blocked):
   `dc exec api python manage.py merge_duplicate_listings --duplicate supply-assistant-nmk7k5 --keep totalenergies-supply-assistant-harare`
   `dc exec api python manage.py merge_duplicate_listings --duplicate transport-and-office-associate-6pkxba --keep acbf-transport-office-associate-harare`
   Read: both listings' facts, shared identifiers (the ACBF pair may share none: then the warning says so), the review notes, the 308 redirect, conflicts. A conflict (for example an unpublished amendment on the duplicate) must be resolved in the workspace first.
5. **An editor confirms each pair on the issuer's original notice** (§4) and only then applies, naming themself and what they checked:
   `dc exec api python manage.py merge_duplicate_listings --duplicate supply-assistant-nmk7k5 --keep totalenergies-supply-assistant-harare --actor <editor e-mail> --evidence "<notice, job id 82490, where and when checked>" --apply`
   (same for the ACBF pair). Rerunning prints `already merged` and changes nothing.
6. **Caches.** Pages and the detail API are not cached. The sitemap feed is cached up to `UPNEXT_SITEMAP_API_CACHE_SECONDS` (300 s, per API process) and again up to `UPNEXT_SITEMAP_CACHE_SECONDS` (300 s, web); the duplicate leaves `/sitemap.xml` within about 10 minutes, or at once after `dc restart api web`.
7. **Verify** from anywhere: `infrastructure/scripts/verify-adsense-fixes.sh https://upnext.co.zw` (exit 0 = every check passed; it also checks robots.txt, /insights, /guides, /privacy, /ads.txt, the meta tag and ad-free pages).
8. Rollback: `infrastructure/deploy/rollback.sh`. Merges are deliberately not reversible by editing rows (ADR-0027); the old release simply ignores the redirect table (the duplicate then answers 404, never reappears).

## 3. Local rehearsal (this session)

On a local stack (PostgreSQL 16, Django dev server, Next.js production build, the demo data plus both pairs recreated with fictional content and the production slugs, AdSense variables set to test values):
- Before: the verification script failed 18 checks (duplicates reachable with 200, in every list, search, `/categories`, related listings and the sitemap).
- `--scan` found the TotalEnergies pair (shared reference 82490 and address once `?src=LinkedIn` is removed); the ACBF pair shares no reliable identifier and its dry run says so, flagging the location wording and the differing verification labels.
- After `--apply` on both, and a rerun reporting `already merged`, the script passed every check: `HTTP/1.1 308 Permanent Redirect`, `location: /opportunities/<canonical>`, one hop to 200, also in capitals and with `?utm_source=whatsapp`; JobPosting only on the canonical page; duplicates gone from home, lists, search, `/categories` and the sitemap.
- `/insights` at 320, 390 and 1280 px: no horizontal scroll, no axe violation (WCAG 2.2 AA tags), six guides, no search form (`screenshots/insights-hub-390-2026-11-16.png`).

## 4. Needs editorial review (not decided by code)

- **TotalEnergies Supply Assistant:** confirm on the employer's notice (job ID 82490) the location (the pages say different things) and whether a closing date is stated; amend the kept listing through the normal review workflow if the notice differs. The live duplicate's apply link carried `src=LinkedIn`; the kept listing should use the issuer's own address.
- **ACBF Transport and Office Associate:** the two pages have different verification labels. The merge keeps both histories and does **not** copy a label: re-check the kept listing (`acbf-transport-office-associate-harare`) under the verification standard (it may be the one *not* labelled Verified).
- **Facts I could not check:** the four live pages were created after the repository's 2026-11-14 snapshot and the live site was blocked from this environment, so the pairs' current content, sources and verification labels are known only from the audit summary. The dry run in step 4 is the authoritative comparison.
- Any further pairs reported by `--scan`.
- D-62 change: the same issuer reference at a different place is now a hard duplicate sent to review (previously a warning); identifier matches can no longer be published directly by one Editor or Administrator. Owner approval needed (D-79).

## 5. Needs the AdSense dashboard (owner)

- **Publisher ID:** AdSense → Account → Settings → Account information. It must equal the id in `/ads.txt` (`pub-5550288003651205` in the 2026-11-14 evidence) and in `UPNEXT_ADSENSE_CLIENT` (`ca-` prefix).
- **Sites → upnext.co.zw:** ads.txt status "Authorised"; ownership verification via "Meta tag" (now emitted) or "Ads.txt snippet". Request review only when the owner decides; this session did not.
- **Auto ads OFF** (Ads → By site). With Auto ads on, Google places ads anywhere the script is loaded, outside the allowed placements.
- **Ad units** for the two placements after approval; then `UPNEXT_ADSENSE_SLOT_JOB_DETAIL`, `UPNEXT_ADSENSE_SLOT_GUIDE`.
- **Privacy & messaging** for the EEA, UK and Switzerland: Google's certified European regulations message or another certified CMP (AS-B06). Needs a code change and CSP review before it is switched on (`docs/engineering/ADSENSE_SITE_VERIFICATION.md`).
- Google approval status: unknown from here; only the dashboard can confirm it.

## 6. Privacy Policy wording to review (approved text, D-76; not edited here)

1. §6A "Your choices": the control is said to be on "any opportunity page or guide"; it is now shown only on open listings with a description, and on guides.
2. §6A EEA/UK/Switzerland paragraph: describes the first-party prompt as how consent is handled there. If a certified CMP is added, or Google limits serving there without one, this paragraph must change.
3. §6A: after a visitor withdraws consent, Google's script already in that page stops requesting ads but is removed only on the next page load; the policy could say so.
4. "Never next to the Apply, Save, Share or navigation buttons" holds only while Auto ads stay off (§5).
5. The `google-adsense-account` meta tag sends nothing to Google; no wording change needed, noted for completeness.
