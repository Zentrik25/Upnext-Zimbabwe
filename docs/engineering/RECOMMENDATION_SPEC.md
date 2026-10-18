# Recommendation scoring specification — rules-v1 — DRAFT

Status: DRAFT, provisional (P6B-04, P6B-05; owner authorisation D-38). The only implementation is `apps/api/profiles/foryou.py`; the tests are `apps/api/tests/test_foryou.py`. Nothing here is an eligibility decision and nothing uses machine learning, a paid service, or any inference from behaviour.

## 1. Principles
1. **Transparent and deterministic.** The same profile and the same listings give the same list, in the same order. There is no numeric score and nothing random.
2. **Explainable.** Every sentence shown to the person is produced by the signal that ranked the listing.
3. **Only stated facts.** A signal compares something the person chose with something the listing actually states. A missing value on either side is never a match, never an exclusion, and never treated as satisfied.
4. **Not an eligibility decision.** The copy never says "you qualify", "eligible", "guaranteed" or "best match" (`FY-06`). The page tells people to read the listing and apply on the official site.
5. **Private input only.** The input is the profile of the signed-in account, read by that account's own request. Nothing is stored; the feed is computed on request.
6. **No discriminatory inputs.** The profile holds no age, sex, gender, marital status, disability, religion, ethnicity, nationality, photograph or name. The listing fields compared are the ones in the table below.

## 2. Candidates
The public, still-open listings from `visible_versions` (the live published revision of a `published` listing) whose deadline is unknown or in the future at the moment of the request, optionally narrowed by `category` and `location`. At most the newest 500 are considered (`CANDIDATE_CAP`). Drafts, in-review, approved, rejected, withdrawn, taken-down, archived and expired listings, and listings past their deadline even if the expiry job has not run, cannot appear. A second copy of the same organisation and title is folded into one.

## 3. Signals
A listing is recommended only if **at least one** signal matches.

| Signal (`signal` value) | Profile field | Listing field | Matches when | Reason shown |
|---|---|---|---|---|
| `category_interest` | categories | category | listing category is one chosen | "Matches your interest in {category}." |
| `sector_interest` | industries | sectors | at least one sector is chosen | "In an industry you follow: {names}." |
| `skills` | skills | listing skills (required or optional) | at least one is in the profile | "Lists skills from your profile: {names}." |
| `location` | preferred places, then home city or province | listing locations | a listing place is, or lies below, a chosen place (country > province > city) | "Located in {place}, one of your preferred places." / "…where your profile says you are based." |
| `work_arrangement` | work arrangements | work mode | the listing states the mode and it is chosen | "Offers {mode} work, which you prefer." |
| `employment_type` | employment types | employment type | stated and chosen | "Employment type: {type}, one you chose." |
| `experience` | experience level | experience level | stated and equal | "States an experience level of {level}, as in your profile." |
| `education` | highest qualification | `detail.minimum_qualification` | stated, not `not_stated`, and **equal** to the profile level | "Lists a minimum of {level}, the same level as your profile." |

Qualification rules (P6B-05): a stated minimum **above** the profile level is shown as a note ("above the level in your profile"), never as an exclusion and never as a reason; a stated minimum **below** the profile level says nothing (a higher qualification is not a reason to match, and not a reason to warn). `professional_qualification` is off the academic ladder and is compared for equality only. Only the jobs schema states a minimum qualification today; for other categories the signal never fires.

Unknowns (`match.unknowns`, at most three, only for jobs, internships and graduate programmes): things the profile states that the listing does not: no experience level, no minimum qualification, no skills, no work mode.

## 4. Order
1. number of matching signals (more first);
2. number of the person's skills the listing lists (more first);
3. listings with a stated deadline before those without, earlier deadline first;
4. newer first publication first;
5. listing id (stable tie-break).

Freshness and closing date therefore act as tie-breakers and are never hidden: the deadline and publication state are on every row.

## 5. Fallback and suggestions
With an empty profile, or when no listing matches, `meta.mode` is `newest` and the page is the newest open listings with no reasons, labelled as such. `meta.suggestions` (at most three) names the empty areas worth filling (interests, skills, place, experience). Ordinary search is unchanged and always available.

## 6. Limits and known weaknesses
- Matching is exact: "mid" does not match "senior", a city does not match its province unless the province is chosen.
- Skills are matched by the approved skills list only; free text never becomes a skill.
- Only the newest 500 open listings are ranked; with launch volumes this is the whole catalogue.
- The ranking cannot know which of several matching signals matters most to a person; it counts them equally.
- Ranking quality needs real listings to judge; the demo data is fictional.

## 7. Changing the rules
Any change to a signal, the order or the wording is a decision-register change with a new `MODEL_VERSION`, updated tests (including the banned-phrase test) and an update of this document.
