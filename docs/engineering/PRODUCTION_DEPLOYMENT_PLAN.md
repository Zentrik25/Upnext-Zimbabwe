# Production deployment plan for https://upnext.co.zw — DRAFT

Status: DRAFT. **A plan only. Nothing in it has been executed or authorised.** Not done by this work, and not to be done without separate written owner approval (Phase 7): any change to live DNS; any change to the shared Traefik/Nginx; starting the production stack; sending e-mail. The Granite Post is not touched. The only public origin is `https://upnext.co.zw` (root name). There is **no `www` host, no other hostname and no redirect** (owner instruction); a request for any other host is simply not routed. The domain is already registered.

## 0. What is unknown and must be established first (read-only)

| # | Unknown | How to establish | Owner |
|---|---|---|---|
| U-1 | Real VPS capacity (CPU, RAM, disk, free ports) and current load from The Granite Post (OQ-10) | read-only inspection (`docker ps`, `df`, `free`; no changes) with the owner present | Owner/operator |
| U-2 | How the shared Traefik reaches Nginx and which one terminates TLS; certificate resolver and entry points; whether wildcard routes exist | read the existing static/dynamic config read-only | Operator |
| U-3 | DNS provider and current zone | zone export (Gate A-2/A-3 in the e-mail checklist) | Owner |
| U-4 | Whether the apex already has records (A/AAAA, MX, TXT) | zone export | Owner |
| U-5 | Secret store for production env values | owner choice | Owner |

The plan below is the **target**; sections marked **[depends on U-2]** change shape once the shared proxy is known.

## 1. Gaps in the repository that Phase 7 must close (honest list)

1. **Production Compose project: written, statically validated, never run on the VPS.** `infrastructure/compose/compose.production.yaml` (project `upnext-prod`; networks `upnext-prod-data` (internal), `-app`, `-egress`; volume `upnext-prod-pgdata`; only the proxy publishes a port, on `127.0.0.1:${UPNEXT_PROXY_PORT:-8090}`), `nginx.production.conf.template` (serves only `upnext.co.zw`; any other Host, including `www`, gets no answer) and the optional `compose.production.edge.yaml` (attaches the proxy to an existing edge network named by `UPNEXT_EDGE_NETWORK`, written for real only after U-2). Tests: `apps/api/tests/test_production_compose.py` (isolation, no secrets in running services, required values, production settings accept the file's environment) and the CI job `production-stack` (`infrastructure/scripts/production-smoke.sh`: boots it with throwaway values on a CI runner). `UPNEXT_EDGE_CIDR` (the shared edge's address range, needed to trust the client address) has no default because it is unknown until U-2.
2. Images: `prod` targets exist for API (gunicorn, health `/health/live`) and web; no registry or tag/digest process is defined. Choose: build on the VPS from a tagged commit, or push to a registry.
3. The scheduled backup job (the worker container is in the Compose project) (cron/systemd timer) using `offsite.sh`.
4. The router/service entry in the shared edge that sends `Host(upnext.co.zw)` to `proxy:80` **[depends on U-2]**, and a runtime check of the hardening the static tests cannot see (read-only root file systems were deliberately not enabled: unverified without a real run).

## 2. Pre-deployment gates (all must be true; see `LAUNCH_BLOCKERS.md`)

B-04 (this plan executed in order), B-05 staff policy, B-06 defaults approved, B-07 backup/restore/alert evidence, B-02 legal review (for any public launch of privacy/terms and profile collection), B-09 real content, B-10 accessibility audit, B-01 only if e-mail is wanted at launch (the site can launch with e-mail off). Written Phase 7 approval from the owner.

## 3. Sequence

### 3.1 Prepare (no public effect)
1. Create a non-superuser owner role and separate app / read-only roles (`provision_db_roles`); keep the migrator credentials out of the running containers.
2. Generate secrets in the secret store: `DJANGO_SECRET_KEY` (50+), `UPNEXT_TOKEN_KEY` (32+, distinct), `UPNEXT_THROTTLE_PEPPER`, DB passwords, `UPNEXT_BACKUP_KEY_FILE` (also escrowed off the server).
3. Production env from `production.env.example`: `UPNEXT_ENVIRONMENT=production`, `UPNEXT_PUBLIC_BASE_URL=https://upnext.co.zw`, `DJANGO_ALLOWED_HOSTS=upnext.co.zw`, `DJANGO_CSRF_TRUSTED_ORIGINS=https://upnext.co.zw`, `UPNEXT_SECURE_COOKIES=true`, `UPNEXT_STAFF_MFA_REQUIRED=true`, `DJANGO_HSTS_SECONDS=31536000` (never includeSubDomains/preload), `UPNEXT_TRUST_PROXY_HEADERS` only after U-2 shows the proxy overwrites `X-Forwarded-Proto`, `UPNEXT_EMAIL_BACKEND=none`, `UPNEXT_BACKUP_EXPECTED=1`, `UPNEXT_ALERT_WEBHOOK_URL`, `UPNEXT_ALERTS_EXPECT_JOBS=worker,housekeeping,expiry,expiry_reminders,backup`, `UPNEXT_ALERT_CERT_HOST=upnext.co.zw:443`. Never set: `UPNEXT_DEMO_TOOLS`, `local-prod-like`, file/console e-mail.
4. Build/pull images at a tagged commit (record the SHA and image digests). Start the stack **without public routing**: `docker compose -p upnext-prod up -d`; run migrations as a release step with owner credentials; `provision_db_roles`; `createsuperuser`/staff accounts per `STAFF_ACCESS_RUNBOOK.md`; **no demo seed** (production refuses it).
5. Internal checks from the server: `/health/ready` 200; `manage.py check_production_config` (zero blocking); `check_alerts`; first `backup.sh` with off-server copy and a measured restore (B-07).

### 3.2 DNS (live change; separate approval; owner or operator with DNS access)
1. Export the current zone. Lower the TTL of the records to be changed (e.g. 300 s) a day before, if they already exist.
2. Add the **apex A record** (and AAAA only if the VPS has IPv6) for `upnext.co.zw` to the VPS address. No `www`, no wildcard, no other name. If the DNS provider proxies traffic (Cloudflare orange cloud), decide deliberately: proxied changes TLS mode, client IP and header trust; the simplest first launch is DNS-only.
3. Do not touch MX/TXT/SPF/DKIM records (e-mail records are a separate gate, `EMAIL_PROVIDER_LAUNCH_CHECKLIST.md`). Add a CAA record only if the owner wants one and it permits the chosen CA.
4. Verify with `dig +short upnext.co.zw` from two resolvers; compare zone export before/after.

### 3.3 Reverse proxy **[depends on U-2]**
Target: shared Traefik terminates (or passes) TLS and routes `Host(upnext.co.zw)` to the UPNEXT Nginx, which routes as in `nginx.tls.conf`. Requirements regardless of shape: only host `upnext.co.zw` is matched; HTTP → HTTPS redirect for that host only; `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` are overwritten at the first proxy and repeated in each `location` (Nginx drops inherited directives); `client_max_body_size 1m`; request-id header; HSTS is set by the application, not duplicated. The change to the shared proxy is a **separate, reviewed, reversible change**: a new router/service file added alongside, never edits to existing Granite Post routers; validate config (`traefik`/`nginx -t`) before reload; reload, never restart.

### 3.4 TLS
Certificate for `upnext.co.zw` only (no SAN for `www`), issued by the certificate resolver already used on the VPS (ACME HTTP-01 needs the DNS from 3.2 and port 80 reachable; use DNS-01 if the DNS provider API is available). Verify: valid chain, TLS 1.2+ only, HSTS present with `max-age=31536000` and no `includeSubDomains`/`preload`, expiry alert configured (`cert.expiring`). Consider submitting HSTS preload: **do not**.

### 3.5 Deployment verification (record every result with time and SHA)
| # | Check | Expected |
|---|---|---|
| V-1 | `curl -I https://upnext.co.zw/` | 200, HSTS, CSP with nonce, `X-Content-Type-Options` |
| V-2 | `curl -I http://upnext.co.zw/` | redirect to https for this host only |
| V-3 | `curl -I https://www.upnext.co.zw/` | not resolvable / not routed (no `www`) |
| V-4 | `/health/ready`, `/robots.txt`, `/sitemap.xml` | 200; sitemap and canonical use `https://upnext.co.zw`; `/api/v1/schema` 404 |
| V-5 | `manage.py check_production_config --url https://upnext.co.zw` | zero blocking findings |
| V-6 | Sign-in as staff incl. second step; cookies `Secure`, `HttpOnly`, `SameSite=Lax`, `__Host-` if enabled | as listed |
| V-7 | Public pages render the UPNEXT Careers identity and monogram; no "NextJob" text | pass |
| V-8 | Search, listing detail, privacy/terms (draft banners + noindex until B-02) | pass |
| V-9 | `check_alerts --notify` test alert received on the real channel | recorded |
| V-10 | Backup runs on schedule with `offsite=yes` | recorded |
| V-11 | The Granite Post still serves correctly | unchanged |
| V-12 | TLS grade/headers external scan; Lighthouse mobile budgets | recorded |

### 3.6 Go-live
Only after V-1 to V-12 and owner sign-off: remove `noindex` where the owner approved (privacy/terms only after B-02), submit the sitemap to search consoles, enable monitoring probe on `/` and `/health/ready`.

## 4. Rollback

| Layer | Rollback | Time |
|---|---|---|
| Application release | redeploy previous image tag/digest; migrations are forward-only, so each release must be backward-compatible for one version, otherwise restore from backup (below) | minutes |
| Proxy | remove the added UPNEXT router/server file and reload (`nginx -t` / Traefik dynamic file removal); existing Granite Post routes were never edited | minutes |
| DNS | restore the exported zone (remove the apex record added); with TTL 300 s, effect within minutes–an hour | minutes–hour |
| Data | restore into a new database from the latest verified backup (`BACKUP_AND_RESTORE.md` §4 and §8.2), then `reapply_deletions`; RPO 24 h / RTO 4 h are targets until measured | hours |
| Secrets | rotate keys per `PRODUCTION_CONFIGURATION.md` (token key rotation invalidates e-mailed links and staff authenticators) | minutes |
| Abort criteria | any V-check failing that is not fixed within the agreed window; any effect on The Granite Post | immediate |

Before DNS go-live, the rollback is simply "stop the `upnext-prod` project": nothing public existed.

## 5. Out of scope here
www/alias hostnames; redirects from any domain; e-mail DNS; CDN; auto-scaling; Redis/Celery (ADR-0004); AI features; PR #14.

## 6. Scripts (launch preparation)
`infrastructure/deploy/`: `inspect-vps.sh` (read-only, section 0), `release.sh` and `rollback.sh` (guarded by `UPNEXT_DEPLOY_CONFIRM=upnext.co.zw`, touch only project `upnext-prod`), `verify.sh` (checks V-1…V-8 and the missing-`www` check), `backup-job.sh` with `upnext-backup.service`/`.timer`. `release.sh`/`rollback.sh` have not been run end to end; the CI job `production-stack` exercises the Compose project, `verify.sh` and the backup job. The consolidated status is `docs/governance/LAUNCH_REPORT.md`.
