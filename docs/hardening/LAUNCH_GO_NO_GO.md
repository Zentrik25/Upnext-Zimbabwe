# Launch go / no-go — DRAFT

Status: DRAFT, 2026-10-30. This is an engineering recommendation for the owner, not a decision. A GO needs evidence; the evidence below is incomplete.

## Recommendation: **NO-GO for a public launch today**

The reason is not a code defect found in this pass. Every launch blocker in `docs/governance/LAUNCH_BLOCKERS.md` (B-01 to B-10) is still open, and several are things only the owner, a lawyer, real staff or the real server can supply. This pass closed none of them.

## What this pass established

| Claim | Evidence | Confidence |
|---|---|---|
| The code on `2855773` passes its own API and web checks | 926 API and 251 web tests, lint, types, migrations (local) | Good for the code; CI on the exact versions not run |
| Closed or expired listings are not offered as open on any public read path | New boundary tests, passing | Good |
| One real defect (HF-01) let a saved, just-closed listing look open; fixed | Test failed before, passes after | Good |
| One real capacity defect (HF-02) shared the anonymous-read limit among all visitors; fixed on the web side | API-level test, web unit tests | Good for the mechanism; production unverified |
| Google sign-in is implemented correctly in code | Code review and tests | Good; configuration unverified |

## What this pass did not establish (so cannot support a GO)

Mobile behaviour at 320 to 430 px; accessibility in a browser or with assistive technology; Core Web Vitals; production capacity; monitoring and alert delivery; backup off-server and restore time; routing alongside The Granite Post; e-mail delivery; Google console configuration; search relevance on real content; the unmerged PR #35.

## Conditions that would turn this into a GO

1. B-01 to B-10 each closed with the evidence listed against it in `docs/governance/LAUNCH_BLOCKERS.md` (B-01 may be deferred by launching without e-mail-dependent features, as that document already allows).
2. CI green on this branch, then on the merged integration branch, including the browser suites.
3. A read-only VPS and proxy inspection, then separate written Phase 7 approval.
4. Owner decisions in section 3 of `docs/hardening/PRODUCT_QUALITY_AUDIT.md` recorded in the decision register.

## Next engineering steps, in order

1. Push this branch and read its CI result (needs your instruction; nothing has been pushed).
2. Decide how PR #35 and this branch are sequenced, then audit mobile on the combined result with the browser suite.
3. Search suggestion mechanism (HF-03), server-side date-only rule (HF-04).
4. Load and Web Vitals measurement once a real environment exists.
