"""JSON API for the staff console (`/staff/` in the Next.js application; D-46, ADR-0024).

It adds no authority. Every write goes through the services that already decide and audit it
(`opportunities.workflow`, `employers.services`, `reports.moderation`, `accounts.mfa`); these views only
authenticate the staff session, check the registry permission, validate the shape of the request and
serialise the result. Django Admin is no longer the staff interface.
"""
