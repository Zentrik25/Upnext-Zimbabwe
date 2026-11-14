# Place catalogue seeding: verification and production runbook — DRAFT

Status: the owner approved seeding the production place catalogue **in principle** on 2026-11-14 (D-75, O-2), on
condition that it is shown to be idempotent, non-destructive and to map existing listings correctly. This document
is that evidence. **The production run needs a separate deployment approval; nothing has been run on production.**

## 1. Why

Production has no places (`/api/v1/locations` returned `[]` on 2026-11-14). Without them no listing can state a
structured place, so no open job carries JobPosting markup, nothing is eligible for the Indexing API, `/locations` is
empty and the Harare and Bulawayo landing pages stay at zero (ADS-T01).

## 2. Evidence

| Condition | Evidence | Result |
|---|---|---|
| Idempotent | `tests/test_place_seeding.py::test_seeding_twice_creates_nothing_the_second_time`: first run creates 21 places (Zimbabwe, 10 provinces, 9 cities, Remote), the second creates nothing and every table count is unchanged | **PASS** |
| Non-destructive | `test_seeding_never_edits_reactivates_or_deletes_existing_rows`: an Administrator's renamed place keeps its name, an inactive place stays inactive, a place the seed does not know (Kariba) is kept; `get_or_create` by slug, nothing updated or deleted (`catalog/seed.py`) | **PASS** |
| Touches no listing | `test_seeding_touches_no_listing`: no INSERT, UPDATE or DELETE on any opportunity table during seeding | **PASS** |
| Dry run writes nothing | `test_the_dry_run_writes_nothing_and_names_inactive_places`: `seed_taxonomies --dry-run` reports "Would create …", names inactive places it will not change, and rolls back | **PASS** |
| Maps existing listings correctly | Seeding itself maps nothing (by design: places reach a listing only through an amendment and a second person's review). The editor matches a written location to places when a listing is saved; `place_match_report` applies the same rule read-only. `catalog/place_match.py` and the editor's `matchPlaces` pass the same 14 shared cases (`docs/engineering/place-match-cases.json`), including the live listings' location texts; `test_the_place_report_maps_open_listings_and_writes_nothing` checks the command writes nothing | **PASS** |

## 3. Expected mapping of the 10 open listings (live data, 2026-11-14)

Computed with `match_places` and the starter places on the public API snapshot
(`docs/adsense/evidence-2026-11-14/listings-snapshot.json`):

| Listing | Written location | Place after an amendment | JobPosting then? |
|---|---|---|---|
| accountant-a3n4am | Estlea, Harare | Harare | yes |
| communications-officer-… (UNOPS) | Home-based | Remote | **no**: a remote job also needs "Zimbabwe" (D-51); editor adds Zimbabwe |
| graduate-trainee-civil-engineering-phduf3 | Mbire, Mashonaland Central, Zimbabwe | Mashonaland Central | yes |
| merchandising-manager-rsd4r2 | Harare, Zimbabwe | Harare | closes 14 Nov |
| mutapa-gold-resources-graduate-trainees-2026 | Shamva, Zimbabwe | **none**: Shamva is not a starter place | editor chooses Mashonaland Central, or an Administrator adds Shamva |
| nurse-aides-9ndkgz | Zimbabwe | **none**: "Zimbabwe" alone is never matched automatically | editor chooses Zimbabwe (countrywide) after checking the advert |
| probfix-graduate-trainee-programme-2027-2028 | Zimbabwe | **none** | as above; closes 15 Nov |
| school-administrator-project-coordinator-z7vxnt | Harare, Zimbabwe | Harare | yes |
| senior-programmes-lawyer-1-post-skx7p4 | Harare, Zimbabwe | Harare | yes |
| software-developer-p5qjrp | Harare | Harare | yes |

7 of 10 gain a place automatically on their next amendment; 3 need an editor's choice.

## 4. Production runbook (only after a separate deployment approval)

1. Back up the database (`docs/engineering/BACKUP_AND_RESTORE.md`).
2. `python manage.py seed_taxonomies --dry-run`: expect "Would create: 21 locations, …" on an empty catalogue;
   note any inactive places it lists.
3. `python manage.py seed_taxonomies`; then `GET /api/v1/locations` lists the 21 places (the public `/locations`
   page shows 20: Remote is a work arrangement, not a place).
4. `python manage.py place_match_report`: compare with §3.
5. `python manage.py check_production_config`: the "place catalogue holds active locations" warning is gone.
6. Editors amend each open listing (the place is matched on save; choose one where the report says none); a second
   person reviews each amendment as usual.
7. Check one job page with Google's Rich Results Test, and `/locations`.

Rollback: the seed only adds rows; if needed an Administrator deactivates places in the staff interface. Places that
listings already use cannot be deleted (protected foreign keys).
