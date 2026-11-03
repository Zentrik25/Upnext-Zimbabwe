-- Synthetic data for performance checks. Run against a SCRATCH copy of the development database (never a real
-- one): it copies the demo listings many times, adds fictional users and saved rows, and disables triggers for
-- the session (the publishing triggers refuse direct writes by design).
--   psql -v copies=2000 -v users=2000 -v heavy=100 -v heavy_saves=150 -d upnext_perf -f synthetic_load.sql
\set ON_ERROR_STOP on
SET session_replication_role = replica;

CREATE TEMP TABLE m AS
SELECT o.id AS old_o, v.id AS old_v, g AS i, gen_random_uuid() AS new_o, gen_random_uuid() AS new_v
FROM opportunities_opportunity o
JOIN opportunities_opportunityversion v ON v.id = o.live_version_id
CROSS JOIN generate_series(1, :copies) g
WHERE o.status = 'published';

INSERT INTO opportunities_opportunity (id, slug, status, verification_level, verification_checked_at, first_published_at, last_published_at, created_at, updated_at, row_version, category_id, created_by_id, live_version_id)
SELECT m.new_o, left(o.slug, 60) || '-p' || m.i, o.status, o.verification_level, o.verification_checked_at,
       now() - (random() * interval '180 days'), now(), o.created_at, now(), o.row_version, o.category_id, o.created_by_id, m.new_v
FROM m JOIN opportunities_opportunity o ON o.id = m.old_o;

INSERT INTO opportunities_opportunityversion (id, version_no, state, title, summary, description_md, requirements_md, work_mode, employment_type, experience_level, location_text, geographic_eligibility, salary_min, salary_max, salary_currency, salary_period, funding_min, funding_max, funding_currency, funding_period, deadline_at, deadline_timezone, deadline_is_date_only, application_method, application_url, application_email, application_instructions, reference_number, contact_details, detail, detail_schema_version, search_vector, submitted_at, approved_at, content_hash, published_at, created_at, approved_by_id, author_id, opportunity_id, organisation_id, published_by_id, submitted_by_id)
SELECT m.new_v, v.version_no, v.state, v.title || ' ' || (ARRAY['Harare','Bulawayo','Gweru','Mutare','Kwekwe'])[1 + (m.i % 5)] || ' ' || m.i, v.summary, v.description_md, v.requirements_md, v.work_mode, v.employment_type, v.experience_level, v.location_text, v.geographic_eligibility, v.salary_min, v.salary_max, v.salary_currency, v.salary_period, v.funding_min, v.funding_max, v.funding_currency, v.funding_period,
  CASE WHEN v.deadline_at IS NULL THEN NULL ELSE now() + (random() * interval '120 days') END, v.deadline_timezone, v.deadline_is_date_only, v.application_method, v.application_url, v.application_email, v.application_instructions, v.reference_number, v.contact_details, v.detail, v.detail_schema_version,
  v.search_vector, v.submitted_at, v.approved_at, v.content_hash, now(), v.created_at, v.approved_by_id, v.author_id, m.new_o, v.organisation_id, v.published_by_id, v.submitted_by_id
FROM m JOIN opportunities_opportunityversion v ON v.id = m.old_v;

INSERT INTO opportunities_versionlocation (is_primary, location_id, version_id)
SELECT l.is_primary, l.location_id, m.new_v FROM m JOIN opportunities_versionlocation l ON l.version_id = m.old_v;

INSERT INTO opportunities_opportunitysource (id, kind, name, url, citation, observed_on, is_primary, created_at, created_by_id, opportunity_id, version_id)
SELECT gen_random_uuid(), s.kind, s.name, s.url, s.citation, s.observed_on, s.is_primary, s.created_at, s.created_by_id, m.new_o, m.new_v
FROM m JOIN opportunities_opportunitysource s ON s.version_id = m.old_v;

-- fictional seekers (no usable password) and their saved listings
INSERT INTO accounts_user (id, password, email, status, display_name, row_version, created_at, updated_at, email_verified_at)
SELECT gen_random_uuid(), '!', 'perf-user-' || g || '@perf.invalid', 'active', 'Perf User ' || g, 0, now(), now(), now()
FROM generate_series(1, :users) g;

CREATE TEMP TABLE u AS SELECT id, row_number() OVER (ORDER BY email) AS n FROM accounts_user WHERE email LIKE 'perf-user-%@perf.invalid';
CREATE TEMP TABLE o AS SELECT id, row_number() OVER (ORDER BY slug) AS n FROM opportunities_opportunity WHERE status = 'published' AND slug LIKE '%-p%';
-- a few heavy savers, everyone else saves a handful
INSERT INTO opportunities_savedopportunity (id, user_id, opportunity_id, created_at)
SELECT gen_random_uuid(), u.id, o.id, now() - (random() * interval '90 days')
FROM u JOIN o ON o.n % 97 = u.n % 97 AND u.n <= :heavy AND o.n <= (u.n * 1000 + :heavy_saves * 97)
LIMIT :heavy * :heavy_saves;
INSERT INTO opportunities_savedopportunity (id, user_id, opportunity_id, created_at)
SELECT gen_random_uuid(), u.id, o.id, now() - (random() * interval '90 days')
FROM u JOIN o ON (o.n + u.n * 13) % 4001 < 5
WHERE u.n > :heavy
ON CONFLICT DO NOTHING;

ANALYZE;
SELECT (SELECT count(*) FROM opportunities_opportunity WHERE status = 'published') AS published,
       (SELECT count(*) FROM accounts_user) AS users,
       (SELECT count(*) FROM opportunities_savedopportunity) AS saved;
