# Security hardening report — DRAFT

Status: DRAFT, 2026-10-30. Read-only review plus the automated checks listed. No production system was touched and no penetration test was run. Findings are numbered HF-nn in `docs/hardening/PRODUCT_QUALITY_AUDIT.md`. The earlier review is `docs/engineering/SECURITY_REVIEW_PHASE5.md`; this report does not replace it.

## 1. Confirmed findings

| # | Priority | Finding |
|---|---|---|
| HF-02 | P1 | Rate-limit identity: server-rendered reads reached the API without a visitor address, so the anonymous-read limit was shared by every visitor (availability and fairness issue, not a data exposure). Details and fix in the audit register |

No confirmed P0 security defect was found in the areas examined. "Not found" here means not found by the reading and tests listed in section 3, not proven absent.

## 2. Reviewed, no defect found

| Area | What was checked | Evidence |
|---|---|---|
| Google OAuth | State, nonce, S256 PKCE, TLS-direct code exchange, issuer, audience, expiry, verified e-mail, `next` limited to a same-site path, staff accounts refused, account linking rules, audit records | `apps/api/accounts/google.py`; `test_registration_and_google.py` passes |
| Secrets | Google client secret appears only in API-side environment configuration, not in any web source or build file. Repository secret scanning runs in CI (`tools/scan-secrets.sh`); **not re-run here** | grep of `apps/web`; compose file |
| Cookies and CSRF | `HttpOnly` session cookie, `SameSite=Lax`, `Secure` and `__Host-` switchable, CSRF token echoed in a header, tests enforce CSRF on writes | `config/settings/base.py`; `test_saved.py` uses `enforce_csrf_checks=True` |
| Headers | CSP with per-request nonce and `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, `nosniff`, `X-Frame-Options: DENY`, COOP, referrer and permissions policies. HSTS only when configured and only over https, never `includeSubDomains` or `preload` without approval | `apps/web/src/proxy.ts`, `next.config.ts` |
| Public data exposure | All anonymous reads pass `visible_versions`; drafts, reviews, unpublished amendments and taken-down listings cannot be reached; cursors are signed and bound to the query | `apps/api/opportunities/public.py`; `test_public_api.py` |
| Object-level access | A registry of every endpoint with its permission and an endpoint review test | `test_access_registry.py`, `test_endpoint_review.py` pass (not re-audited line by line) |
| Rate limits | Login 20 per 15 min, registration 5 per hour, e-mail requests 10 per hour, reports 5 per hour, writes 60 per min, all proposed values (OQ-17) | `config/settings/base.py` |
| Dependencies | `npm ci`: 0 advisories reported. `pip-audit` runs in CI against the runtime pins; **not run here** | install log |
| Static analysis | ruff (includes security rules in use), mypy: clean | run output |

## 3. Test evidence

API 933 passed, 94.37% coverage; web 257 passed; both after the changes. New: `tests/test_throttle_identity.py` (two tests: unidentified reads share a bucket; forwarded visitors do not) and `apps/web/tests/unit/visitor-address.test.ts` (6 tests, including rejection of a header-injection string and of the sitemap case). CI itself was **not** run: this branch has not been pushed with a CI result.

## 4. Implemented fixes

HF-02 on the web side only (`apps/web/src/lib/catalog.ts`). Trust rule: the address is accepted only because the API is reachable only inside the compose network and nginx overwrites `X-Forwarded-For`. If the API were ever published directly, any client could choose its own limit bucket for anonymous reads; that is stated in the code comment and is unchanged for login and e-mail limits, which are reached through nginx.

## 5. Proposed improvements

- Set `NUM_PROXIES` explicitly in DRF so only the intended number of forwarded entries is trusted, and add a production-compose test that the API port is not published.
- Move the anonymous-read counter to the shared cache only if measurement shows two independent counters are a problem.
- Add `pip-audit` and `npm audit` output to the release checklist as recorded artefacts.

## 6. Unverified conditions

- Whether the real edge (Traefik, then nginx) overwrites `X-Forwarded-For` as the template does: needs the read-only VPS inspection that Phase 7 has not been authorised to do.
- Google Cloud Console configuration (authorised redirect URI, consent screen, published status).
- Database privileges of the production role; backup encryption keys; TLS certificate expiry monitoring on the real host.
- A scripted object-identifier probe against a running stack (predictable-ID tests exist in the suite; none was run against a live deployment).
- XSS review beyond the existing sanitiser tests and the CSP.

## 7. Outstanding blockers

B-02 (legal review), B-04 (domain, TLS, cookies on the real front), B-05 (staff access policy), B-08 (deployment path) in `docs/governance/LAUNCH_BLOCKERS.md`. None is closed by this pass.

## 8. Required owner decisions

Approve the trust assumption in section 4; approve `NUM_PROXIES` configuration as a follow-up; authorise the read-only VPS inspection when the owner is ready.
