# ADR-0025 — Social sharing images, Open Graph text and editable addresses (D-47)

Status: ACCEPTED by owner instruction of 2026-10-29. Not deployed. Builds on ADR-0024 (direct staff publishing).

## Context
Links to listings were shared with the site's generic card. Editors need to choose the picture and wording a shared
link shows (WhatsApp, Facebook, LinkedIn, Telegram, X), and need addresses (slugs) they can choose and, when
necessary, change without breaking links already shared.

## Decision
**Data.** `OpportunityVersion` gains `featured_image`, `featured_image_alt`, `social_image`, `social_image_alt`,
`og_title`, `og_description` (with the D-46 `seo_title`, `seo_description`, `slug_request`). Images are rows of
`catalog.MediaAsset` (content-addressed by SHA-256, BYTEA in PostgreSQL, insert-only by trigger), shared by the
revisions that use them. The new columns join the revision's content hash only when set, so hashes of earlier
revisions remain valid. Replacing an image on an amendment leaves the old asset for the revisions that still show it.

**Why PostgreSQL and not files.** The project has no file storage or object store; adding one would add a
service and a backup path. Listing images are small (re-encoded, at most 1600 px) and are public, cacheable and
immutable, so the database plus a long `Cache-Control` is enough. The backup procedure already covers them.

**Intake.** `catalog.media.process` decodes with Pillow (the content decides the type), limits size (5 MB), pixels
and minimum dimensions, applies EXIF orientation, drops all metadata by re-encoding, and writes JPEG (or PNG when
there is transparency). It never reshapes silently: unsuitable shape or size yields warnings; a centre crop to
1200 x 630 happens only when the editor ticks it.

**Serving.** `GET /api/v1/media/<sha256>.<jpg|png>` is unauthenticated (crawlers), content-addressed
(`Cache-Control: public, max-age=31536000, immutable`, ETag, 304), and returns 404 unless a publicly readable
listing's live revision shows the asset. Drafts, rejected, taken-down and archived listings never expose images.

**Metadata.** The public detail API returns `og_title`, `og_description`, `featured_image`, `social_image` (the
featured image when no separate one exists). Empty Open Graph text falls back to a suggestion computed when read
("<Title> at <Organisation> | UPNEXT Careers"; "<Organisation> is recruiting a <Title> in <Location>. View
requirements, closing date and application details on UPNEXT Careers."), so typed text is never overwritten by
later edits. The Next.js page emits `title`, `description`, canonical, `openGraph.*` (type website, url, title,
description, image with its real width, height, alt and `secureUrl` on https) and `twitter` `summary_large_image`
in the server-rendered HTML. Listings from before images existed keep the site card.

**Addresses.** One namespace, compared case-insensitively: `lower(slug)` unique index on listings, a unique
`lower(old_slug)` index on `SlugRedirect`, and a trigger so no address is both a current slug of one listing and a
recorded old slug (or the current slug of another listing). Availability is checked while typing (staff endpoint),
when a draft is saved and when publishing; a clash returns **HTTP 409** with a field error and the message "This
slug already exists. Please enter a unique slug."; numbers are never appended automatically. Concurrent attempts
are decided by the unique index. **ADR-0006 is amended:** transition **T17 `change_slug`** (permission
`opp.slug_change`, Editors and Administrators) records the old slug in `SlugRedirect` and then updates the slug;
the database refuses any slug change without that record. The API answers an old address with `301` and the new
slug; the web page issues a permanent redirect (Next.js `permanentRedirect`, which sends 308, treated by search
engines as 301). Old addresses are reserved for good and are never reused, not even by the same listing.

**Publishing rule.** A staff-created listing needs a featured image with alt text at its first publication.
Employer listings, which have no image upload, keep their moderation path unchanged and are not blocked.

## Consequences
* New migrations `catalog/0005`, `opportunities/0008` and `0009` (columns, tables, indexes and triggers); the
  existing records need no data change.
* New dependency use: Pillow (already added for logos, D-46).
* Platforms keep their own caches; a changed image or text may take time to show on WhatsApp or Facebook.
  Because assets are content-addressed, a replaced image gets a new URL, which helps crawlers refresh.
* Redirect chains are collapsed: every old address points at the listing, which redirects to its current slug.
