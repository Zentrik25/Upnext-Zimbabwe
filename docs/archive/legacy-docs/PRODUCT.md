# Product specification — UPNEXT MVP

## Mission
Zimbabwe-first opportunity discovery platform covering jobs, internships, graduate trainee programmes, scholarships, tenders, and grants.

## Roles
Visitor: browse/search/filter/read opportunity pages without an account.
Registered seeker: all visitor actions plus profile, personalised feed, save/unsave, alert preferences (actual email delivery is a separately approved milestone).
Editor: draft/edit listings.
Reviewer/admin: verify sources, approve, publish, archive and audit changes.

## Opportunity data
ID, slug, title, category, organisation, location, location_type, summary, description, requirements, qualifications/skills tags, source_name, source_url, application_url, published_at, deadline_at with timezone, verification_status, editorial_status, created_at, updated_at, reviewed_by, reviewed_at. Some fields nullable with explicit UI fallbacks. Never manufacture deadlines or salaries.

## Core journeys
1. Visitor opens homepage, filters opportunities, opens detail page and follows external application link.
2. User registers, verifies account per approved policy, completes optional profile (education level, skills, interests, location), sees explainable matches.
3. Signed-in user bookmarks opportunities and manages profile.
4. Editor drafts listing, reviewer validates original source and approves, listing publishes, expires or archives.

## Content safety
Display source attribution, direct application destination, date checked, and editorial verification state. Never claim applications are submitted through UPNEXT unless implemented. Distinguish expired, unknown deadline and closing soon.

## Out of scope
Employer self-service, payments, CV upload/parsing, automated scraping, automated applications, AI eligibility assessment, native mobile apps.
