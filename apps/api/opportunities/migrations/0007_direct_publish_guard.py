"""Database re-assertion of direct publication (D-46, EDITORIAL_WORKFLOW T16).

A revision may go from draft straight to published only when it is flagged `published_directly`, its publisher
is its own author, it has no approver, it carries a content hash, and that person holds an active Editor or
Administrator role. The flag can be set on no other transition, so review-pipeline publication still needs
another person's approval of the exact revision, and the flag can never be added to a frozen revision.
"""

from django.db import migrations

VER = "opportunities_opportunityversion"

NEW = f"""
CREATE OR REPLACE FUNCTION upnext_version_guard() RETURNS trigger AS $$
DECLARE
    mutable text[] := ARRAY['state', 'submitted_by_id', 'submitted_at', 'approved_by_id', 'approved_at',
                            'published_by_id', 'published_at', 'search_vector'];
    allowed boolean;
BEGIN
    allowed := CASE OLD.state
        WHEN 'draft' THEN NEW.state IN ('draft', 'in_review', 'discarded', 'published')
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
    IF NEW.published_directly AND NEW.state NOT IN ('published', 'superseded') THEN
        RAISE EXCEPTION 'only a directly published revision carries the direct-publication flag'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.state = 'approved' AND OLD.state <> 'approved' THEN
        IF NEW.approved_by_id IS NULL OR NEW.approved_by_id IN (SELECT upnext_chain_authors(NEW.id))
           OR NOT EXISTS (SELECT 1 FROM opportunities_reviewdecision r
                           WHERE r.version_id = NEW.id AND r.decision = 'approved'
                             AND r.decided_by_id = NEW.approved_by_id AND r.content_hash = NEW.content_hash) THEN
            RAISE EXCEPTION 'approval must come from a different person and record this exact revision'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    IF NEW.state = 'published' AND OLD.state <> 'published' THEN
        IF OLD.state = 'draft' THEN
            -- Direct publication (D-46): staff-created listings only, by the author, who holds a publishing role.
            IF NOT NEW.published_directly
               OR NEW.published_by_id IS NULL OR NEW.published_by_id <> NEW.author_id
               OR NEW.approved_by_id IS NOT NULL
               OR NEW.content_hash IS NULL
               OR EXISTS (SELECT 1 FROM employers_employerlisting el WHERE el.opportunity_id = NEW.opportunity_id)
               OR NOT EXISTS (SELECT 1 FROM accounts_staffroleassignment a
                               WHERE a.user_id = NEW.published_by_id AND a.revoked_at IS NULL
                                 AND a.role IN ('editor', 'administrator')) THEN
                RAISE EXCEPTION 'a draft can be published directly only by its author, an Editor or Administrator, '
                                'on a staff-created listing'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;
        ELSIF NEW.published_directly THEN
            RAISE EXCEPTION 'a reviewed revision cannot carry the direct-publication flag'
                USING ERRCODE = 'integrity_constraint_violation';
        ELSIF NEW.published_by_id IS NULL OR NEW.approved_by_id IS NULL
           OR NEW.approved_by_id IN (SELECT upnext_chain_authors(NEW.id))
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
"""

OLD = f"""
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
        IF NEW.approved_by_id IS NULL OR NEW.approved_by_id IN (SELECT upnext_chain_authors(NEW.id))
           OR NOT EXISTS (SELECT 1 FROM opportunities_reviewdecision r
                           WHERE r.version_id = NEW.id AND r.decision = 'approved'
                             AND r.decided_by_id = NEW.approved_by_id AND r.content_hash = NEW.content_hash) THEN
            RAISE EXCEPTION 'approval must come from a different person and record this exact revision'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    IF NEW.state = 'published' AND OLD.state <> 'published' THEN
        IF NEW.published_by_id IS NULL OR NEW.approved_by_id IS NULL
           OR NEW.approved_by_id IN (SELECT upnext_chain_authors(NEW.id))
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
"""


class Migration(migrations.Migration):
    dependencies = [
        ("opportunities", "0006_direct_publishing"),
        ("accounts", "0001_initial"),
        ("employers", "0001_initial"),
    ]
    operations = [migrations.RunSQL(NEW, OLD)]
