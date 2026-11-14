"""Career Insights (D-78): the seven starting categories, and database triggers that re-check the editorial rules.

* A review decision may not be recorded by the article's author, creator or submitter (separation of duties,
  D-18 and D-22 applied to articles), whatever code path inserts it.
* Reviews and events are append-only: no UPDATE or DELETE.
* A published article's live snapshot must cover an approved hash: `live_hash` equals `approved_hash` whenever the
  live snapshot changes (publication is the only way to change it).

Categories are created only if missing and never overwrite an Administrator's edits.
"""

import uuid

from django.db import migrations

CATEGORIES = [
    ("career-advice", "Career Advice", "Practical advice on finding work, changing direction and building a career in Zimbabwe."),
    ("cvs-and-interviews", "CVs & Interviews", "Preparing CVs, cover letters and applications, and getting ready for interviews and assessments."),
    ("graduates-and-internships", "Graduates & Internships", "Graduate trainee programmes, industrial attachment, internships and first jobs."),
    ("job-market-insights", "Job Market Insights", "How hiring works in Zimbabwe: sectors, recruitment practices and what adverts ask for."),
    ("skills-and-professional-development", "Skills & Professional Development", "Building the skills, qualifications and professional registrations employers look for."),
    ("employment-guides", "Employment Guides", "Contracts, deductions, rights and responsibilities at work, explained plainly."),
    ("scholarships-and-education", "Scholarships & Education", "Scholarships, bursaries and study routes, and how to judge an offer."),
]  # fmt: skip

TRIGGERS = """
CREATE OR REPLACE FUNCTION insights_review_not_author() RETURNS trigger AS $$
BEGIN
    IF NEW.decided_by_id IN (
        SELECT a.author_id FROM insights_article a WHERE a.id = NEW.article_id
        UNION SELECT a.created_by_id FROM insights_article a WHERE a.id = NEW.article_id
        UNION SELECT a.submitted_by_id FROM insights_article a WHERE a.id = NEW.article_id AND a.submitted_by_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'separation of duties: the author, creator or submitter cannot review this article'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER insights_review_not_author BEFORE INSERT ON insights_articlereview
    FOR EACH ROW EXECUTE FUNCTION insights_review_not_author();

CREATE OR REPLACE FUNCTION insights_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER insights_review_append_only BEFORE UPDATE OR DELETE ON insights_articlereview
    FOR EACH ROW EXECUTE FUNCTION insights_append_only();
CREATE TRIGGER insights_event_append_only BEFORE UPDATE OR DELETE ON insights_articleevent
    FOR EACH ROW EXECUTE FUNCTION insights_append_only();

CREATE OR REPLACE FUNCTION insights_live_is_approved() RETURNS trigger AS $$
BEGIN
    IF NEW.live IS NOT NULL AND (OLD.live IS DISTINCT FROM NEW.live)
       AND (NEW.approved_hash = '' OR NEW.live_hash IS DISTINCT FROM NEW.approved_hash) THEN
        RAISE EXCEPTION 'only an approved article can be published'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER insights_live_is_approved BEFORE UPDATE ON insights_article
    FOR EACH ROW EXECUTE FUNCTION insights_live_is_approved();
"""

DROP = """
DROP TRIGGER IF EXISTS insights_live_is_approved ON insights_article;
DROP FUNCTION IF EXISTS insights_live_is_approved();
DROP TRIGGER IF EXISTS insights_event_append_only ON insights_articleevent;
DROP TRIGGER IF EXISTS insights_review_append_only ON insights_articlereview;
DROP FUNCTION IF EXISTS insights_append_only();
DROP TRIGGER IF EXISTS insights_review_not_author ON insights_articlereview;
DROP FUNCTION IF EXISTS insights_review_not_author();
"""

NAMESPACE = uuid.UUID("2b6a3c9e-58f1-4f0e-9b8f-6f2e1a7c4d10")


def seed(apps, schema_editor):  # type: ignore[no-untyped-def]
    Category = apps.get_model("insights", "ArticleCategory")
    for order, (slug, name, description) in enumerate(CATEGORIES, start=1):
        Category.objects.get_or_create(
            slug=slug,
            defaults={
                "id": uuid.uuid5(NAMESPACE, slug),
                "name": name,
                "description": description,
                "display_order": order * 10,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("insights", "0001_initial")]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
        migrations.RunSQL(TRIGGERS, DROP),
    ]
