# JURO Mobile Audit

Status: **partial**
Target widths: 320, 360, 375, 390/393, 430, 768, 1024, 1280, 1440, and 1920 px.

## Current evidence

- historical Chrome checks recorded zero horizontal overflow for the canonical document builder at 320, 360, 390, 768, 1024, 1280, and 1440 px;
- a later production check recorded the lawyer registration route at 360 px without horizontal overflow;
- the platform shell has regression tests for one mobile navigation control path, focus behavior, and document route containment;
- public-site link and route crawls prove reachability, not visual correctness.

## Required matrix still open

| Area | Checks required |
| --- | --- |
| Entry/auth | registration, OTP, MFA, error/retry, keyboard resize, deep-link return |
| Client/Business | dashboard, AI, cases, plans, documents, comparison, lawyer handoff |
| Lawyer | dashboard, requests, scoped case access, messages, profile, pending state |
| Admin | console, tables, moderation, fresh-MFA actions, dialogs |
| Cross-cutting | 200% zoom, touch targets, safe areas, sticky/fixed collisions, long RU/UZ text, reduced motion |

The matrix is not `VERIFIED` until current production states are inspected in authorized Chrome sessions. No Edge, Firefox, Safari/WebKit, or physical-device claim is made in this active goal.
