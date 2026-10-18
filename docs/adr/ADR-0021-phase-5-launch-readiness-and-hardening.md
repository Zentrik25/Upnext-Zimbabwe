# ADR-0021: Phase 5 — launch readiness and hardening

- **Status:** ACCEPTED as an implementation approach (Phase 5 authorised by the owner, 2026-10-18, D-32). The provisional defaults P5-01…P5-12 are **not** owner decisions.
- **Decision register:** D-31, D-32; P5-01…P5-12. Builds on ADR-0004, ADR-0019, ADR-0020.

## Decision
1. **Prove configuration without deploying.** A preflight command checks settings, the database role and, with `--url`, a running stack's TLS, headers and cookies; a Compose overlay puts a throwaway-certificate proxy in front of the production-mode stack. Findings that matter only on a real deployment are warnings on `local-prod-like` stacks, so a rehearsal never produces a clean pass for them.
2. **Least privilege at the database.** The migrator owns the schema; the service and worker use one non-owner role with data rights only, no change to audit or editorial history, no user deletion and no edit of migration history; a read-only role serves backups. Triggers remain the primary guard; privileges are defence in depth.
3. **Backups are encrypted, authenticated and rehearsed.** Scripts and a CI rehearsal prove the procedure; storage is the owner's decision and none exists. Deletions are re-applied after a restore from a log kept outside the database.
4. **Monitoring is built to be connected, not connected.** Job state, an alert catalogue, debounced notification and an optional generic webhook; no channel is configured.
5. **Delivery must be verified before features depend on it.** A verification record tied to the live sender configuration gates change of e-mail address; throwaway stacks with demo tools count as verified so the browser tests can run; production refuses demo tools.
6. **Content tooling cannot bypass the workflow.** The importer can create drafts only (its imports are statically checked); the content-health page includes an audit query for separation-of-duties violations.
7. **Load test findings change the architecture minimally:** threaded workers, in-process counters for anonymous reads, a cached sitemap feed.

## Consequences
- New tables `core_jobrun` and `notifications_emaildeliveryverification`, a column `accounts_authtoken.new_email`, three new e-mail kinds and templates, three additive API operations (`requestEmailChange`, `receiveEmailEvents`, and `email_change_available` on `User`).
- The Compose entrypoint can run migrations as the owner while the service connects as the application role.
- Per-process counters make the anonymous-read limit approximate when several workers run.

## Alternatives considered
Redis for counters and caches (deferred, ADR-0004; revisit with the load figures); a provider-specific webhook parser now (rejected: no provider is chosen); hiding change of e-mail behind a configuration flag the operator could flip without proof (rejected: the point is evidence); a separate jobs database role (merged into the application role: one role keeps the boundary simple, and the trigger and privilege guards already protect the sensitive tables).
