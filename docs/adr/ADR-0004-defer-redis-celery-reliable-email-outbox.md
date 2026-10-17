# ADR-0004: Defer Redis and Celery; reliable email through a database outbox

- **Status:** ACCEPTED (owner approval recorded as D-11 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-11

## Context
Verification and password-reset emails are required for accounts. The specification listed Celery/Redis in the base stack, but the shared VPS has unmeasured headroom and no feature yet needs a broker.

## Decision
1. Redis and Celery are **not** part of Release 1 foundations. They are introduced only when reliable background processing requires them (review triggers in SECURITY_ARCHITECTURE §4.4, OQ-30).
2. Email delivery is designed now behind an `EmailSender` interface (console/file for dev, fake for tests, provider adapter chosen under OQ-03).
3. Emails are created through a **transactional outbox** (`email_outbox`) in the same DB transaction as the state change, delivered by a `process_email_outbox` worker using `FOR UPDATE SKIP LOCKED`, at-least-once delivery, exponential back-off with jitter, bounded attempts, dead-letter state, `job_run` heartbeat and alerts.
4. Tokens are HMAC-derived so no recoverable secret is stored in the database or outbox.
5. Sessions are database-backed and rate-limit counters use a database cache while Redis is deferred. Expiry runs as a scheduled management command.
6. Moving to Celery later replaces the worker's invoker, not the domain code: the outbox remains the source of truth.

## Consequences
- No broker to operate on the shared VPS; fewer moving parts and lower memory use.
- Throughput is limited to what one or a few polling workers can drain; acceptable for verification/reset volumes, to be re-evaluated when alerts or digests are approved.
- The worker needs a scheduler or a long-running process; the deployment form is an operational choice (Phase 4/7).
- Database cache and sessions add write load; measure before launch.

## Alternatives considered
Celery + Redis from day one (rejected by D-11); sending email inside request handlers (rejected: loses messages, enumeration timing, provider latency); cron-only fire-and-forget scripts without an outbox (rejected: no durability).
