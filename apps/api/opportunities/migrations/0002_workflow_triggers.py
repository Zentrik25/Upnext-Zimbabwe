"""Database re-assertion of the editorial invariants (ERD §7, EDITORIAL_WORKFLOW §4).

The publishing service is the only intended writer, but these triggers mean a bug, a shell session or a
direct SQL statement still cannot: edit a frozen revision, review one's own work, publish a revision that
was not approved by a different person, change a slug, or alter review/verification/event history.
"""

from django.db import migrations

OPP = "opportunities_opportunity"
VER = "opportunities_opportunityversion"

FUNCTIONS = f"""
CREATE OR REPLACE FUNCTION upnext_chain_authors(vid uuid) RETURNS SETOF uuid AS $$
    WITH RECURSIVE chain AS (
        SELECT v.id, v.based_on_version_id, v.author_id, v.submitted_by_id
          FROM {VER} v WHERE v.id = vid
        UNION ALL
        SELECT p.id, p.based_on_version_id, p.author_id, p.submitted_by_id
          FROM {VER} p JOIN chain c ON p.id = c.based_on_version_id
         WHERE p.state NOT IN ('published', 'superseded')
    )
    SELECT author_id FROM chain
    UNION
    SELECT submitted_by_id FROM chain WHERE submitted_by_id IS NOT NULL;
$$ LANGUAGE sql STABLE;

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

CREATE OR REPLACE FUNCTION upnext_no_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
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

CREATE OR REPLACE FUNCTION upnext_child_of_draft_only() RETURNS trigger AS $$
DECLARE
    vid uuid := COALESCE(NEW.version_id, OLD.version_id);
    st text;
BEGIN
    SELECT state INTO st FROM {VER} WHERE id = vid;
    IF st IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'rows of a frozen revision are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upnext_opportunity_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.slug IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'a slug is immutable once assigned' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
        RAISE EXCEPTION 'the category of a listing is immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

DROP_FUNCTIONS = """
DROP FUNCTION IF EXISTS upnext_opportunity_guard();
DROP FUNCTION IF EXISTS upnext_child_of_draft_only();
DROP FUNCTION IF EXISTS upnext_reviewer_not_author();
DROP FUNCTION IF EXISTS upnext_no_delete();
DROP FUNCTION IF EXISTS upnext_version_guard();
DROP FUNCTION IF EXISTS upnext_chain_authors(uuid);
"""

ID_TABLES = [
    OPP,
    VER,
    "opportunities_opportunitysource",
    "opportunities_verificationrecord",
    "opportunities_reviewdecision",
    "opportunities_publishingevent",
]
APPEND_ONLY = [
    "opportunities_verificationrecord",
    "opportunities_reviewdecision",
    "opportunities_publishingevent",
]
CHILDREN = [
    "opportunities_versionlocation",
    "opportunities_versionskill",
    "opportunities_versionsector",
    "opportunities_opportunitysource",
]

TRIGGERS: list[tuple[str, str]] = []
for t in ID_TABLES:
    TRIGGERS.append(
        (
            f"CREATE TRIGGER {t}_id_immutable BEFORE UPDATE ON {t} FOR EACH ROW EXECUTE FUNCTION upnext_prevent_id_update();",
            f"DROP TRIGGER IF EXISTS {t}_id_immutable ON {t};",
        )
    )
for t in (OPP, VER):
    TRIGGERS.append(
        (
            f"CREATE TRIGGER {t}_no_delete BEFORE DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION upnext_no_delete();",
            f"DROP TRIGGER IF EXISTS {t}_no_delete ON {t};",
        )
    )
for t in APPEND_ONLY:
    TRIGGERS.append(
        (
            f"CREATE TRIGGER {t}_append_only BEFORE UPDATE OR DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION upnext_append_only();",
            f"DROP TRIGGER IF EXISTS {t}_append_only ON {t};",
        )
    )
for t in ("opportunities_reviewdecision", "opportunities_verificationrecord"):
    TRIGGERS.append(
        (
            f"CREATE TRIGGER {t}_not_author BEFORE INSERT ON {t} FOR EACH ROW EXECUTE FUNCTION upnext_reviewer_not_author();",
            f"DROP TRIGGER IF EXISTS {t}_not_author ON {t};",
        )
    )
for t in ("opportunities_versionlocation", "opportunities_versionskill", "opportunities_versionsector", "opportunities_opportunitysource"):
    TRIGGERS.append(
        (
            f"CREATE TRIGGER {t}_draft_only BEFORE INSERT OR UPDATE OR DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION upnext_child_of_draft_only();",
            f"DROP TRIGGER IF EXISTS {t}_draft_only ON {t};",
        )
    )
TRIGGERS.append(
    (
        f"CREATE TRIGGER {VER}_guard BEFORE UPDATE ON {VER} FOR EACH ROW EXECUTE FUNCTION upnext_version_guard();",
        f"DROP TRIGGER IF EXISTS {VER}_guard ON {VER};",
    )
)
TRIGGERS.append(
    (
        f"CREATE TRIGGER {OPP}_guard BEFORE UPDATE ON {OPP} FOR EACH ROW EXECUTE FUNCTION upnext_opportunity_guard();",
        f"DROP TRIGGER IF EXISTS {OPP}_guard ON {OPP};",
    )
)


class Migration(migrations.Migration):
    dependencies = [
        ("opportunities", "0001_initial"),
        ("audit", "0002_append_only"),
        ("core", "0002_id_immutability_function"),
    ]
    operations = [
        migrations.RunSQL(FUNCTIONS, DROP_FUNCTIONS),
        *[migrations.RunSQL(create, drop) for create, drop in TRIGGERS],
    ]
