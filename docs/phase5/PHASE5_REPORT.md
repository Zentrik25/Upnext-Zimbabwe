# Phase 5 report — launch readiness and hardening

Status: DRAFT, implemented and awaiting review. Authorised by the owner on 2026-10-18 (D-32; plan baseline `24cf2d7`, CI 39099190045). Nothing was deployed; the VPS, Traefik/Nginx and The Granite Post were not touched. Phase 6 (profile and For You) was not started.

**Headline: the engineering work for launch readiness is built and tested locally, and no launch blocker is closed.** Every blocker needs something that only the owner, a lawyer, real staff, real content or the real infrastructure can supply. Nothing below claims e-mail delivery, legal approval, accessibility testing by people, off-server backup storage or real editorial content, because none of those exists.

## 1. Completed engineering work (by milestone)

| M | Delivered | Evidence |
|---|---|---|
| M5.0 | D-32 and provisional defaults P5-01…P5-12 in the decision register, ADR-0021, 7 new requirements (R-34…R-40) and 15 new planned tests in the traceability table (192 planned, 145 implemented) | docs check, traceability generator |
| M5.1 (WS1) | Provider-neutral signed bounce/complaint feed (`POST /api/v1/hooks/email`); delivery-verification record bound to the live sender configuration and the command that writes it; scorecard for **Resend and Amazon SES** (not chosen, nothing configured); change of e-mail address built and gated on verified delivery (D-31) | `test_email_provider.py`, `test_email_change.py`, web unit tests, accounts journey 9/9 |
| M5.2 (WS2) | Data inventory with a test that fails on an unlisted personal-looking column; privacy notice and terms updated (scam warning, backups, e-mail change, providers as open fields); legal review pack (12 questions); rights procedures. Pages remain drafts, noindex, bracketed gaps intact | `test_data_inventory.py` |
| M5.3 (WS3) | `check_production_config`; `provision_db_roles` (application role with data rights only; read-only role); local TLS overlay with a throwaway CA; production-mode API connecting as the non-owner role; web HSTS behind https; `seed_demo` refuses without demo tools; preflight flags demo data | preflight 58 passed, 3 warnings, 0 failures; `test_preflight.py` against real PostgreSQL roles |
| M5.4 (WS4) | Encrypted, authenticated backup script, retention pruning, restore into a new database, tamper refusal, `restore_check`, `reapply_deletions`; `core_jobrun`, alert catalogue (17 codes), debounced worker notification, optional generic webhook; monitoring and backup documents | rehearsals below; `test_operations.py` |
| M5.5 (WS5) | Load tool, session generator and soak script; ladder and soak results; mobile-budget specs; accessibility audit plan | results below |
| M5.6 (WS6) | Editorial handbook; draft-only importer (statically checked); content-health report and staff page; separation-of-duties audit query | `test_content_ops.py` |
| M5.7 | Close-out, CI job `tls-rehearsal`, this report | CI (section 5) |

## 2. Checks actually run

| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check`, `mypy` (150 files), `makemigrations --check`, `spectacular --validate --fail-on-warn` | pass |
| Backend `pytest` | **506 passed**, coverage 93.95% (floor 85%), also with demo tools unset as in CI. New this phase: 108 tests |
| Web `lint`, `typecheck`, `format:check`, `tokens:check`, `build` | pass |
| Web unit tests | **87 passed** |
| Browser suite on the **production-mode API behind local TLS, connecting as the non-owner database role** (`infrastructure/scripts/tls-e2e.sh`: main suite with strict console, accessibility, accounts and CMS journeys) | **132 passed, 5 skipped, 0 failed**. The skips: four mobile-budget tests (run separately, below) and journey 9b, which is off on this stack by design (9a asserts the 503 and the hidden panel) |
| Accounts journey on the development stack (includes change of e-mail, 9b) | 9 passed |
| Mobile budgets (`E2E_PERF=1`, slow 4G, 4x CPU, 390 px, production build) | 4 passed: LCP 440 to 496 ms, CLS 0, transfer 161 to 169 KiB, script 142 KiB (budget 150) |
| Preflight against the TLS stack | 58 passed, **3 warnings** (no e-mail provider, no verification record, no contact address), 0 failures |
| Backup and restore rehearsal, small dataset (618 rows) | encrypted, tampered copy refused, restored copy equals the source, application read paths answer |
| Same rehearsal with 24,012 listings (174,816 rows, 9.96 MB encrypted) | backup 2 s; restore plus privileges 5 s; equals the source |
| Load ladder (24,012 listings, resource-limited containers) | 8.8 req/s: API p95 91 ms; 21.5: 159 ms; 34.2: 252 ms; saturation near 45 req/s; 0 errors |
| Soak, 6 minutes at 23.7 req/s, then **20 minutes at 24.0 req/s** | 8,633 and 28,863 requests, 0 errors, API p95 140 and 160 ms, memory (230 to 252 MiB) and connections (10 or fewer) flat |
| Spike: 120 users within 2 s (above capacity) | 40.7 req/s, p95 1.9 s, 0 errors (degrades, does not fail) |
| Endpoint-by-endpoint authorisation review (`test_endpoint_review.py`, 5 tests) | pass: every operation protected or on the reviewed public list; anonymous and missing-CSRF refused; no 5xx to hostile input |
| Docs check, traceability generator, secret scan | pass (secret scan clean over 47 commits; four reviewed false positives added) |
| GitHub Actions | see section 5 |

Raw outputs: `docs/phase5/acceptance/`.

## 3. Problems found by this work and fixed
1. **nginx dropped forwarded headers on the web route** (a location with its own `proxy_set_header` discards inherited ones): fixed in both local proxy configurations; HSTS and https detection depend on it.
2. **Services with different token keys** broke every e-mailed link and every derived two-step secret; the TLS profile and the configuration guide now require one shared key.
3. **Plain-text e-mails were HTML-escaped** (a name such as "Tom & Jerry" arrived as `&amp;`, and a link's `&` as `&amp;`): templates now render without escaping; test added.
4. **Load test:** two synchronous workers, a database write for every anonymous read counter, and an uncached public sitemap feed (about 540 ms each) capped throughput at about 31 req/s with multi-second latency. Changes: threaded workers, in-process anonymous-read counters, a five-minute sitemap feed cache; saturation rose to about 45 req/s.
5. The new sitemap cache broke the freshness assertions of the browser tests; the test stacks set it to 0.
6. `seed_demo` could previously run on a production-mode stack with `--force`; it now needs demo tools, which production refuses.

## 4. Unresolved launch requirements (nothing here is closed)

| Blocker | What exists now | What is still needed, with the evidence that would close it |
|---|---|---|
| B-01 e-mail provider | Adapter, bounce feed, verification record and gate, scorecard (Resend, Amazon SES) | Owner's choice; real account and domain authentication; test mail reaching Gmail, Outlook and a local mailbox; a person runs `record_email_verification`. **No provider chosen, no real message sent; change of e-mail stays off in production until then** |
| B-02 legal | Inventory, drafts, legal pack, rights procedures | Lawyer's review and the owner's recorded approval. **No legal conclusion or approval exists. Zimbabwean law was not researched** |
| B-03 contact address | Pages ready | Owner sets `UPNEXT_CONTACT_EMAIL` |
| B-04 domain and TLS | Local rehearsal, 0 preflight failures | Real domain, certificate and front (Phase 7) |
| B-05 staff access | Mandatory two-step (owner decision), no IP restriction (owner decision), runbook, role-change alert | Named staff; a drill on the real setup (**no drill with real people was run**) |
| B-06 defaults | Register P2…P5 | Owner approval |
| B-07 backups and monitoring | Scripts, rehearsed restore, alert catalogue and webhook | **No storage target exists and no backup was stored off a server; no alert reached a real channel; RTO of 4 hours is unproven on real infrastructure** (the measured 5 s is for a laptop-sized dataset) |
| B-08 deployment | — | Phase 7 and separate written authorisation |
| B-09 real content | Handbook, importer, content-health page, SoD audit | **No real content exists** (100 listings from 30 issuers by three real people); approved schemas and taxonomies |
| B-10 accessibility | Automated suite, budgets, audit plan | **No screen reader, real-device or manual testing was performed**; testers and a report |

## 5. GitHub Actions
Run 39106296242 on commit `33a6eda` completed **successfully** (API, web, documentation, secret scan, local TLS rehearsal and production-mode end-to-end jobs), checked through the GitHub API. The earlier run on `448d5ac` (39105027857) failed because one existing test called `seed_demo --force` without demo tools after the new guard; fixed in `33a6eda`. The final commit and its run are recorded in the hand-off message and in section 8.

## 6. Deviations, limitations and risks
- The application and worker share one database role (the `upnext_jobs` role of the security architecture was merged into it; ADR-0021). The PostgreSQL image's bootstrap user is a superuser; a real server needs a non-superuser owner role.
- Anonymous-read throttle counters are per process, so the effective limit is up to the rate times the number of workers. The 240/min per-address default may be too tight for mobile networks where many people share an address (PERFORMANCE_AND_LOAD.md §4); it is an owner decision with the real network picture.
- Load figures are for one machine and resource-limited containers, not the VPS (OQ-10). The longest soak was 20 minutes (the plan asked for 60).
- The bounce feed accepts a neutral format only; a provider's own event format needs a small translator once a provider is chosen.
- Change of e-mail keeps sessions (as planned) and refuses staff accounts (an Administrator changes them). On throwaway stacks with demo tools the gate counts as open so browser tests can run; production refuses demo tools at start-up.
- Restore re-applies completed deletions only if the log lines `account.deletion_completed` were kept outside the database; the log retention decision is open.
- The first TLS rehearsal run failed (journeys 3 and 1, a header assertion) because of items 1 and 2 above; they are fixed and the final run is the one reported.
- The Phase 4 sitemap-freshness tests pass only with the API sitemap cache off on test stacks; CI's prod-like stack inherits that from `compose.yaml`.

## 7. Phase 6 readiness
Profile and rules-v1 For You are designed and approved (D-31) and unstarted. Personalisation should start only after the launch blockers above are closed or the owner decides otherwise in writing. **No Phase 6 work and no deployment was done or is authorised.**

## 8. Follow-up after the first review pass (2026-10-18)
- Search field: the separate Search button was removed (commit `094abbf`); magnifier inside the field, Enter and the phone Search key submit, blank searches are not sent, filters preserved. Verified at 320, 390, 768 and 1440 px on both pages (`docs/phase5/acceptance/search-verification.txt` and screenshots): no button, one icon, `enterkeyhint=search`, 4px radius, 39 px height, 13 px text, focus outline 2 px, no horizontal overflow.
- Added the endpoint-by-endpoint authorisation review test and `SECURITY_REVIEW_PHASE5.md` (a self-review, not an independent audit); a 20-minute soak and a spike test.
- Still not done (needs owner, people, tools or infrastructure): independent penetration test, container image scan and SBOM (needs a chosen scanner and a pinned CI action), staff drills, manual accessibility audit, off-server backup, real alert channel, real e-mail verification, legal review, real content, a 60-minute soak.
- **Verified CI:** run 39108398767 on commit `8da2337` completed **successfully** (https://github.com/Zentrik25/Upnext-Zimbabwe/actions/runs/39108398767), checked through the GitHub API, after run 39106296242 on `33a6eda` (also green). This line was added in a later documentation-only commit, whose own run is not recorded here.

## 9. Rebrand and Resend (owner instruction 2026-10-18; D-33, D-34)

- **Rebrand to NextJob Zimbabwe:** titles, descriptions, Open Graph (`openGraphFor`), structured data, wordmark, favicon, header/footer, About/Contact/Privacy/Terms drafts, API title and e-mail subjects. The Contact page lists mailboxes only when their variables are set. Design tokens, 4px control radius and the flat style are unchanged. Internal identifiers keep the old spelling (D-33). Earlier sections of this report keep the name UPNEXT as the historical record.
- **E-mail:** every message is now multipart (plain text plus an HTML alternative built from it; no images, scripts or tracking pixels); new notice when a deletion request is cancelled (migration `0005`); From, Reply-To and footer address come from environment variables.
- **Resend:** SMTP checks for host `smtp.resend.com` (user `resend`, 465/ssl or 587/starttls) and `POST /api/v1/hooks/email/resend` (signature over the raw body, 5-minute window, duplicate handling, permanent bounces and complaints suppress, temporary failures never). Header names, payload fields and DNS record shapes are **unconfirmed against Resend's current documentation** (not reachable from the build environment).
- **Not done / owner actions:** Resend account and domain verification, DNS records from Resend, SPF/DKIM/DMARC evidence, test mail in Gmail, Outlook and a Zimbabwean mailbox, creating the five mailboxes, setting the production environment, DNS for the website, any redirect. **B-01 and B-03 remain open.** Change of e-mail stays off until the delivery-verification record exists.
- No real e-mail was sent, no DNS or infrastructure was touched, nothing was deployed.
