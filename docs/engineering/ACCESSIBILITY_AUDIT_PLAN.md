# Accessibility verification — plan and status — DRAFT

Status: DRAFT (Phase 5, WS5, blocker B-10). **The manual audit has NOT been performed.** No screen reader, assistive-technology or real-device session has been run by anyone, and no accessibility statement can truthfully be published yet. What exists is automated checking, described honestly below.

## 1. What has been run (automated, repeatable)
axe-core (WCAG 2.0/2.1/2.2 A and AA plus best practice) on every public and account page at 320, 390, 768 and 1440 px; no horizontal scroll; 400% zoom reflow; keyboard order and focus visibility; heading structure; tap target size; flat-design and 4px control guards (D-29). They run in CI on the production-mode stack. Automated tools find only part of the problems that exist.

## 2. What has to be done by people (launch requirement)
Testers (the owner supplies them or approves an auditor). Real devices: a low-end Android phone with Chrome and TalkBack, an iPhone with Safari and VoiceOver, a desktop with NVDA on Firefox and Chrome. Also: browser zoom 200% and 400%, text-size increase, reduced motion, forced colours, keyboard only, slow connection.

Journeys to script and record (pass or fail, severity, screenshot or note): 1 find a listing from the home page; 2 search and filter, read the result count; 3 open a detail page, find the deadline, source and verification label, reach the apply link; 4 save a listing; 5 register and confirm the address; 6 sign in; 7 reset a password; 8 change the e-mail address; 9 delete the account and cancel; 10 provoke an error state; 11 staff: sign in with the second step, create a draft, review (staff site, Django Admin, desktop only for now).

Severity: high (blocks a task), medium (hard but possible), low (annoyance). **High and medium are fixed before launch or explicitly accepted in writing by the owner.** Record: tester, device, assistive technology and version, date, finding, fix commit.

## 3. Known gaps before the audit
Staff pages are wide tables that need horizontal scrolling on a phone (accepted for now); the staff site's CSP still allows inline styles because Django Admin needs them; no accessibility statement exists. A draft statement should be written only after the audit, from its real findings.

## 4. Status
Automated: passing (see the Phase 5 report for the run). Manual audit: **not started; needs testers**.
