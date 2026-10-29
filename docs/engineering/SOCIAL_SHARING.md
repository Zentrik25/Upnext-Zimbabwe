# Social sharing, search presentation and addresses (D-47, ADR-0025)

Status: DRAFT until the owner approves. Describes what is built; nothing is deployed.

## What an editor does
1. Create the listing in `/staff/` (Editors and Administrators publish their own staff-created listings, D-46).
2. **Featured image** section: upload a JPEG, PNG or WebP (up to 5 MB, at least 300 x 157), add alt text. Required
   before a new listing is first published; drafts may lack one.
3. **Social & SEO** section: web address (slug), SEO title and description, Open Graph title and description (leave
   blank to use the suggestion shown), and the link-preview image: use the featured image, or upload a custom
   1200 x 630 image (tick *Crop* to crop the centre; otherwise nothing is reshaped).
4. The panel below the fields previews WhatsApp, Facebook, LinkedIn and X from what is typed and chosen. It is a
   guide: each platform decides its own layout and keeps its own cache.
5. *Publish now*, then *Copy public link* on the listing page. To change the address later use *Change web
   address*; the old one redirects permanently.

## What a crawler gets
* `/opportunities/<slug>` returns, in the server-rendered HTML: `title`, `description`, canonical, `og:title`,
  `og:description`, `og:url`, `og:type=website`, `og:image` (+ `og:image:secure_url` on https, `:width`, `:height`
  of the served file, `:alt`, `:type`) and `twitter:card=summary_large_image` with title, description and image.
* The image is `https://upnext.co.zw/api/v1/media/<sha256>.<jpg|png>`: public, no cookies, `Cache-Control: public,
  max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options: nosniff`. It is served only while a publicly
  readable listing (published, expired or withdrawn) shows it; drafts, rejected and taken-down listings return 404.
* Replacing an image creates a new URL (content-addressed), so platforms fetch the new picture.

## Checking a link by hand
```bash
curl -s https://upnext.co.zw/opportunities/<slug> | grep -E 'og:|twitter:|canonical'
curl -sI https://upnext.co.zw/api/v1/media/<sha256>.jpg
curl -sI https://upnext.co.zw/opportunities/<old-slug>   # 308 to the current address
```
Use the platforms' own debuggers (Facebook Sharing Debugger, LinkedIn Post Inspector) after publishing; WhatsApp has
none and may show an older card until its cache refreshes.

## Addresses
* 8-80 characters, lower-case letters, digits and single hyphens; compared without regard to case.
* Taken means: another listing uses it now, or any listing used it before. Answer: HTTP 409 and "This slug already
  exists. Please enter a unique slug." Nothing is appended automatically.
* PostgreSQL enforces it (unique `lower(slug)`, unique `lower(old_slug)`, cross-table trigger); a slug cannot change
  without its old value being recorded first (T17).
* The API answers an old address with 301; the web page redirects with Next.js `permanentRedirect` (status 308,
  a permanent redirect search engines treat like 301).

## Limits and known gaps
* Old listings keep working: without images they share the site card; hashes of earlier revisions are unchanged.
* Employer listings have no image upload (the employer portal is unchanged) and are exempt from the featured-image
  requirement.
* Telegram uses the same Open Graph tags; it has no separate preview in the panel.
