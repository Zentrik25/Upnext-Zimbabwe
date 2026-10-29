# Evidence for D-47 (local run, not production)

Captured against a local Django (dev settings, staff two-factor off for the capture only) and Next.js dev server, with
two labelled test images (gradients, not photographs). `og-tags.txt` is the Open Graph block read from the initial
HTML of the published page (fetched without running JavaScript). On `http://localhost` the page does not emit
`og:image:secure_url`; with the production origin (https) it does (covered by `tests/unit/social.test.ts`).
