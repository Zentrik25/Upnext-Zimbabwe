# Local development

Everything runs in containers pinned to the approved versions (Python 3.14.8, PostgreSQL 18.6, Node.js 24.22.0, Nginx 1.31.2), so you need only **Git and Docker with Compose v2**. Nothing here touches The Granite Post, the shared VPS or any Traefik/Nginx configuration: the Compose project is named `upnext-dev`, uses its own network and volumes, and publishes a single port on **127.0.0.1 only**.

## 1. First start

```bash
git clone <repository-url> upnext && cd upnext
cp infrastructure/compose/.env.example infrastructure/compose/.env
# Replace every CHANGE_ME with a random value (the file is git-ignored):
python3 -c "import secrets; print(secrets.token_urlsafe(48))"      # POSTGRES_PASSWORD
python3 -c "import secrets; print(secrets.token_urlsafe(64))"      # DJANGO_SECRET_KEY

cd infrastructure/compose
docker compose up --build -d          # builds images, waits for health checks
docker compose ps                     # db, api, web, proxy should all be "healthy"
```

Open **http://localhost:8080/** (home page, shows live API status) and **http://localhost:8080/design-system** (UI primitives). Through the same origin: `GET /api/v1/`, `GET /health/live`, `GET /health/ready`, and (development only) `GET /api/v1/schema` for the generated OpenAPI document and `/staff/` for the read-only Django admin shell.

Stop with `docker compose down` (keep data) or `docker compose down -v` (delete the database volume).

If your source files are not owned by uid 1000, set `UPNEXT_UID` / `UPNEXT_GID` in `.env` to your own ids (Next.js dev rewrites `tsconfig.json` and `next-env.d.ts` in the bind-mounted source). If your network intercepts TLS, set `UPNEXT_CA_BUNDLE=/path/to/ca.pem` in `.env`; it is mounted as a build-time secret only.

## 2. Database and migrations
Migrations are applied automatically when the `api` container starts in development (`UPNEXT_RUN_MIGRATIONS=1`). Manually:

```bash
docker compose exec api python manage.py migrate
docker compose exec api python manage.py showmigrations
docker compose run --rm api python manage.py makemigrations --check --dry-run   # must report "No changes"
```
The custom user model (`accounts.User`, uuid primary key, `citext` e-mail) is created by the first migration, before any other table. PostgreSQL 18 images keep the cluster under `/var/lib/postgresql`, so the volume is mounted there.

Create a development staff account (bootstrap only; real role management arrives in Phase 2):
```bash
docker compose exec -e UPNEXT_BOOTSTRAP_PASSWORD='choose-a-long-password' api \
  python manage.py create_staff_user --email you@example.org --display-name "You" --role administrator
```

## 3. Checks and tests
Backend (inside the pinned Python image; PostgreSQL is used for the tests):
```bash
docker compose run --rm api ruff check .
docker compose run --rm api ruff format --check .
docker compose run --rm api mypy .
docker compose run --rm api pytest                       # coverage gate 85 %
docker compose run --rm api python manage.py spectacular --validate --file /tmp/schema.yaml
```
Frontend (inside the Node 24 container):
```bash
docker compose exec web npm run lint
docker compose exec web npm run typecheck
docker compose exec web npm run format:check
docker compose exec web npm run tokens:check
docker compose exec web npm test
docker compose exec web npm run build
```
End-to-end (Playwright, runs on your machine against the running stack; needs Node 24 and a browser):
```bash
cd apps/web && npm ci && npx playwright install chromium
BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```
The strict "no console / CSP errors" check is meant for the production-mode stack (the Next.js dev server legitimately logs HMR and un-nonced style warnings). Verify the production images with:
```bash
cd infrastructure/compose
docker compose -f compose.yaml -f compose.prod-like.yaml up --build -d
cd ../../apps/web && BASE_URL=http://127.0.0.1:8080 E2E_STRICT_CONSOLE=1 npm run test:e2e
```
Repository-level checks (documentation consistency, traceability, secrets):
```bash
docker compose run --rm api python /repo/tools/check_docs.py      # the dev api container mounts the repo at /repo (read-only)
python tools/traceability/generate.py                                                 # regenerates docs/governance/TRACEABILITY.md
bash tools/scan-secrets.sh                                                            # needs detect-secrets and git
```

## 4. Configuration reference (environment only; nothing is read from files in Git)
| Variable | Service | Purpose |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | db, api | database name and credentials (required) |
| `DJANGO_SECRET_KEY` | api | ≥50 random characters in production (required) |
| `DJANGO_SETTINGS_MODULE` | api | `config.settings.dev` (Compose), `.test` (tests), `.prod` (production image) |
| `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` | api | host allow-list and trusted origins (required in prod) |
| `UPNEXT_SECURE_COOKIES`, `UPNEXT_HOST_COOKIE_PREFIX` | api | Secure cookies (required in prod) and optional `__Host-` prefix (needs one hostname, OQ-01) |
| `UPNEXT_TRUST_PROXY_HEADERS` | api | trust `X-Forwarded-Proto` only behind a proxy that overwrites it (verify before Phase 7) |
| `UPNEXT_LOG_LEVEL`, `UPNEXT_THROTTLE_*` | api | log level; throttle rates (PROPOSED values, OQ-17) |
| `API_INTERNAL_URL` | web | server-side URL of the API (never sent to the browser) |
| `UPNEXT_HTTP_PORT` | proxy | loopback port (default 8080) |

Production settings **refuse to start** with a short or default secret key, an empty host list, or insecure cookies.

## 5. How the pieces fit
`browser → proxy (Nginx, local only) → web (Next.js, /) | api (Django/DRF, /api/, /health/, /staff/, /static/) → db (PostgreSQL)`. The web app calls the API server-side over the internal network; the browser only ever talks to the single origin (cookie sessions, CSRF header, no CORS). Logs are JSON on stdout with a request id and no credentials, e-mail addresses or query strings.

## 6. What is not here yet
Registration/verification/reset flows, the opportunity workflow and CMS, search, matching, notifications, deployment. See `docs/phase1/PHASE1_SCOPE_AND_GATES.md`.
