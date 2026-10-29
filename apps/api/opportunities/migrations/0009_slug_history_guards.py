"""Database guards for editable slugs and immutable media (D-47).

A slug may change only after the old one was recorded in `opportunities_slugredirect` for the same listing in the
same transaction; no address can belong to two listings, whether current or historical, in any letter case; media
assets and recorded redirects are append-only.
"""

from django.db import migrations

OLD_GUARD = """
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

NEW_GUARD = """
CREATE OR REPLACE FUNCTION upnext_opportunity_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.slug IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
        IF NEW.slug IS NULL OR NOT EXISTS (
            SELECT 1 FROM opportunities_slugredirect r
             WHERE r.opportunity_id = OLD.id AND lower(r.old_slug) = lower(OLD.slug)) THEN
            RAISE EXCEPTION 'a slug changes only after the old address is recorded for redirection'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
        RAISE EXCEPTION 'the category of a listing is immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upnext_slug_namespace() RETURNS trigger AS $$
BEGIN
    IF TG_TABLE_NAME = 'opportunities_opportunity' THEN
        IF NEW.slug IS NOT NULL AND EXISTS (
            SELECT 1 FROM opportunities_slugredirect r WHERE lower(r.old_slug) = lower(NEW.slug)) THEN
            RAISE EXCEPTION 'this address is reserved by a redirect' USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM opportunities_opportunity o
                    WHERE lower(o.slug) = lower(NEW.old_slug) AND o.id <> NEW.opportunity_id) THEN
            RAISE EXCEPTION 'this address belongs to another listing' USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

FORWARD = NEW_GUARD + """
CREATE TRIGGER opportunities_opportunity_slug_namespace BEFORE INSERT OR UPDATE OF slug
    ON opportunities_opportunity FOR EACH ROW EXECUTE FUNCTION upnext_slug_namespace();
CREATE TRIGGER opportunities_slugredirect_namespace BEFORE INSERT
    ON opportunities_slugredirect FOR EACH ROW EXECUTE FUNCTION upnext_slug_namespace();
CREATE TRIGGER opportunities_slugredirect_append_only BEFORE UPDATE OR DELETE
    ON opportunities_slugredirect FOR EACH ROW EXECUTE FUNCTION upnext_append_only();
CREATE TRIGGER opportunities_slugredirect_id_immutable BEFORE UPDATE
    ON opportunities_slugredirect FOR EACH ROW EXECUTE FUNCTION upnext_prevent_id_update();
CREATE TRIGGER catalog_mediaasset_append_only BEFORE UPDATE OR DELETE
    ON catalog_mediaasset FOR EACH ROW EXECUTE FUNCTION upnext_append_only();
CREATE TRIGGER catalog_mediaasset_id_immutable BEFORE UPDATE
    ON catalog_mediaasset FOR EACH ROW EXECUTE FUNCTION upnext_prevent_id_update();
"""

REVERSE = """
DROP TRIGGER IF EXISTS catalog_mediaasset_id_immutable ON catalog_mediaasset;
DROP TRIGGER IF EXISTS catalog_mediaasset_append_only ON catalog_mediaasset;
DROP TRIGGER IF EXISTS opportunities_slugredirect_id_immutable ON opportunities_slugredirect;
DROP TRIGGER IF EXISTS opportunities_slugredirect_append_only ON opportunities_slugredirect;
DROP TRIGGER IF EXISTS opportunities_slugredirect_namespace ON opportunities_slugredirect;
DROP TRIGGER IF EXISTS opportunities_opportunity_slug_namespace ON opportunities_opportunity;
DROP FUNCTION IF EXISTS upnext_slug_namespace();
""" + OLD_GUARD


class Migration(migrations.Migration):
    dependencies = [
        ("opportunities", "0008_social_seo"),
        ("catalog", "0005_mediaasset"),
    ]
    operations = [migrations.RunSQL(FORWARD, REVERSE)]
