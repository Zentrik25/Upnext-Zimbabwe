Fonts served from this origin (no third-party font request), Latin subsets from the Fontsource packages:

- **Inter** (SIL Open Font License 1.1, https://rsms.me/inter/), weights 300 (body and headings, the Stripe design system's signature light weight) and 400 (buttons, links, navigation).
- **Source Code Pro** (SIL Open Font License 1.1, Google), weight 500, for code, technical labels and eyebrows.

The Stripe design system names `sohne-var`, a commercial typeface that cannot be redistributed; Inter is the
open stand-in (D-45). Its `ss01` set is not in these subsets, so `font-feature-settings: "ss01"` is declared for
fidelity and has no effect until Söhne is licensed. Regenerate or replace from `@fontsource/inter` and
`@fontsource/source-code-pro` (v5) latin woff2 files.
