# Security review, Phase 5 — DRAFT

Status: DRAFT. A self-review by the engineering side, using automated checks and reading the code. **It is not an independent security audit or penetration test, and nobody outside the project has reviewed it.** Findings below were found and handled during Phase 5; the residual risks are what remains.

## 1. What was reviewed and how
| Area | Method | Result |
|---|---|---|
| Every implemented API operation | `tests/test_endpoint_review.py`, driven by the contract: each operation is either protected by a session cookie or on an explicit reviewed public list; protected operations refuse anonymous callers (401/403) and refuse an authenticated caller with no CSRF token on unsafe methods (403); no operation answers 5xx to oversized, malformed, null-byte, path-traversal-like or script-like input; no response shows a server version or a stack trace | passes (5 tests); a new endpoint fails the first test until it is classified |
| Settings, database role, headers, cookies, TLS, redirect | `check_production_config` against the production-mode stack behind local TLS | 58 passed, 3 warnings (no provider, no verification record, no contact address), 0 failures |
| Database privileges | `test_preflight.py` against real PostgreSQL roles | the application role cannot change schema, audit or editorial-history tables, users or migration history |
| Separation of duties after the fact | `sod_violations()` audit query, tested against a deliberately broken row | none in the data produced by the tests and the demo workflow |
| Secrets | secret scan over every commit; production start-up refusals | clean; four reviewed false positives |
| Dependencies | `pip-audit` and `npm audit` (production, must be clean) in CI | clean on the CI runs |
| Logs and alerts | redaction tests; alert payload contains only alert fields | pass |

## 2. Findings during Phase 5 (all fixed)
1. The local proxy dropped forwarded headers on the web route, so https detection and HSTS on pages failed (fixed; test over TLS).
2. Services configured with different token keys broke e-mailed links and two-step secrets (documented: one shared key).
3. Plain-text mail was HTML-escaped (fixed).
4. `seed_demo` could be forced on a production-mode stack (fixed: needs demo tools, which production refuses; preflight also flags demo data).
5. The public sitemap feed cost about 540 ms per call and was a cheap way to occupy workers (cached five minutes).
6. Every anonymous read wrote to the database for throttle counting (moved to process memory; security counters stay in the database).

## 3. Residual risks and gaps (nothing here is closed)
- **No independent review or penetration test.** Needed before launch (owner decision).
- **No container image scan or software bill of materials.** Language-level advisories are checked in CI; operating-system packages in the images are not scanned. Adding a scanner needs a pinned, reviewed CI action and the owner's choice of tool.
- **Timing equality for unknown addresses** is comparable, not proven (from Phase 3).
- **Staff site:** Django Admin needs inline styles, so its CSP is weaker than the public site's; phones are not supported; staff drills with real people have not been run.
- **Throttling:** anonymous-read counters are per process; a limit suited to shared mobile addresses is undecided (PERFORMANCE_AND_LOAD §4.1). The staff site and login throttles use the shared database cache.
- **Bounce feed** accepts a neutral format signed with one shared secret; its secret handling and rotation need an owner procedure, and provider-specific signature schemes are not implemented.
- **Backups** are encrypted with a key the owner must hold apart; key custody and an off-server target do not exist yet.
- **The bootstrap database role is a superuser** in the PostgreSQL image; a real server needs a non-superuser owner role.
- **TLS, HSTS, cookies on the real domain** are verified only on a local rehearsal (Phase 7).
- **Breach procedure** is not written (LEGAL_REVIEW_PACK L-8).
