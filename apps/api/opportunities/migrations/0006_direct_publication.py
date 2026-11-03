"""Direct publication by staff authors (D-46, ADR-0024).

Adds `direct_publication` to revisions and teaches the two database guards from migration 0002 about it. The
separation-of-duties rules stay exactly as they were for every other revision. A revision may be approved and
published by its own author only when **all** of these hold, re-checked by the database:

* the revision was flagged `direct_publication` while it was still a draft (the flag is frozen with the content);
* the approver is the revision's author, holds an active Editor or Administrator role and is an active account;
* no employer owns the listing (an `EmployerListing` row means the employer moderation path applies);
* the approval is recorded as a review decision of the exact content hash, as before.

Verification records are untouched: the author of a revision can never verify it.
"""

import importlib

from django.db import migrations, models

VER = "opportunities_opportunityversion"

NEW_FUNCTIONS = f"""
CREATE OR REPLACE FUNCTION upnext_direct_publication_ok(vid uuid, uid uuid) RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM {VER} v
         WHERE v.id = vid AND v.direct_publication AND v.author_id = uid
           AND EXISTS (SELECT 1 FROM accounts_staffroleassignment a
                         JOIN accounts_user u ON u.id = a.user_id
                        WHERE a.user_id = uid AND a.revoked_at IS NULL
                          AND a.role IN ('editor', 'administrator') AND u.status = 'active')
           AND NOT EXISTS (SELECT 1 FROM employers_employerlisting e WHERE e.opportunity_id = v.opportunity_id)
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION upnext_version_guard() RETURNS trigger AS $$
DECLARE
    mutable text[] := ARRAY['state', 'submitted_by_id', 'submitted_at', 'approved_by_id', 'approved_at',
                            'published_by_id', 'published_at', 'search_vector'];
    allowed boolean;
BEGIN
    allowed := CASE OLD.state
        WHEN 'draft' THEN NEW.state IN ('draft', 'in_review', 'discarded')
        WHEN 'in_review' THEN NEW.state IN ('in_review', 'approved', 'rejected')
        WHEN 'approved' THEN NEW.state IN ('approved', 'rejected', 'published')
        WHEN 'rejected' THEN NEW.state IN ('rejected', 'discarded')
        WHEN 'published' THEN NEW.state IN ('published', 'superseded')
        ELSE NEW.state = OLD.state
    END;
    IF NOT allowed THEN
        RAISE EXCEPTION 'invalid revision state change % -> %', OLD.state, NEW.state
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.state <> 'draft' AND (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
        RAISE EXCEPTION 'content of a frozen revision is immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.state = 'approved' AND OLD.state <> 'approved' THEN
        IF NEW.approved_by_id IS NULL
           OR (NEW.approved_by_id IN (SELECT upnext_chain_authors(NEW.id))
               AND NOT upnext_direct_publication_ok(NEW.id, NEW.approved_by_id))
           OR NOT EXISTS (SELECT 1 FROM opportunities_reviewdecision r
                           WHERE r.version_id = NEW.id AND r.decision = 'approved'
                             AND r.decided_by_id = NEW.approved_by_id AND r.content_hash = NEW.content_hash) THEN
            RAISE EXCEPTION 'approval must come from a different person and record this exact revision'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    IF NEW.state = 'published' AND OLD.state <> 'published' THEN
        IF NEW.published_by_id IS NULL OR NEW.approved_by_id IS NULL
           OR (NEW.approved_by_id IN (SELECT upnext_chain_authors(NEW.id))
               AND NOT upnext_direct_publication_ok(NEW.id, NEW.approved_by_id))
           OR NOT EXISTS (SELECT 1 FROM opportunities_reviewdecision r
                           WHERE r.version_id = NEW.id AND r.decision = 'approved'
                             AND r.decided_by_id = NEW.approved_by_id AND r.content_hash = NEW.content_hash) THEN
            RAISE EXCEPTION 'publication requires another person''s approval of this exact revision'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upnext_reviewer_not_author() RETURNS trigger AS $$
DECLARE
    reviewer uuid;
    ver_hash bytea;
BEGIN
    IF TG_TABLE_NAME = 'opportunities_reviewdecision' THEN
        reviewer := NEW.decided_by_id;
        SELECT content_hash INTO ver_hash FROM {VER} WHERE id = NEW.version_id;
        IF ver_hash IS DISTINCT FROM NEW.content_hash THEN
            RAISE EXCEPTION 'a review must record the exact content hash of the revision'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        -- Only an approval can be a direct publication's self-review; a rejection or return is never one.
        IF NEW.decision = 'approved' AND upnext_direct_publication_ok(NEW.version_id, reviewer) THEN
            RETURN NEW;
        END IF;
    ELSE
        reviewer := NEW.checked_by_id;
    END IF;
    IF reviewer IN (SELECT upnext_chain_authors(NEW.version_id)) THEN
        RAISE EXCEPTION 'separation of duties: the author or submitter cannot review or verify this revision'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


_previous = importlib.import_module("opportunities.migrations.0002_workflow_triggers")
RESTORE = _previous.FUNCTIONS + "\nDROP FUNCTION IF EXISTS upnext_direct_publication_ok(uuid, uuid);"


class Migration(migrations.Migration):
    dependencies = [("opportunities", "0005_public_query_shape")]

    operations = [
        migrations.AddField(
            model_name="opportunityversion",
            name="direct_publication",
            field=models.BooleanField(default=False),
        ),
        migrations.RunSQL(NEW_FUNCTIONS, RESTORE),
    ]
