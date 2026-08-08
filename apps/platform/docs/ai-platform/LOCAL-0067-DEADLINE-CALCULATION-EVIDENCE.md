# Local 0067 — auditable deadline calculation

Date: 2026-08-04

Environment: local development only. Staging and production were not mutated.

## Implemented vertical slice

- authenticated, tenant-scoped deadline preview API;
- deterministic calendar/business-day, inclusive/exclusive and roll rules;
- explicitly supplied holiday list and version evidence;
- safe earlier date and inspectable warnings;
- separate user confirmation through immutable plan versioning;
- server recomputation with `DEADLINE_PREVIEW_STALE` tamper rejection;
- evidence propagation to generated tasks;
- evidence clearing after a manual due-date change;
- RU/UZ accessible native controls and responsive reading-first layout.

No official holiday calendar or legal basis is fabricated. Every calculator
result remains `preliminary` even when a user supplies descriptive source text.

## Local evidence

- migration `0067` is expand-only and passed in-memory apply/default/constraint tests;
- Wrangler 4.92.0 listed only `0067` pending for local `juro-development` and
  executed all 17 commands successfully;
- 10 focused calculator, migration and route-boundary tests passed;
- typecheck and lint passed without errors or warnings;
- complete platform tests, Cloudflare tests/types, staging build/artifact and
  environment matrix exited successfully;
- document-builder smoke passed 34 scenarios and verified DOCX/PDF/ZIP output;
- comparison smoke passed with PDF/DOCX exports;
- extended case smoke created a real local D1 case, returned preview
  `2026-08-12`, rejected a tampered `2026-08-13`, confirmed the plan, read back
  safe date `2026-08-11`, created tasks and read back the same machine evidence.

## Staging gate

The owner subsequently authorized and completed the private backup/round-trip
restore, migration `0067` and staging deploy. See
`STAGING-0067-DEADLINE-CALCULATION-EVIDENCE.md` for authoritative remote
evidence. Authenticated RU/UZ browser verification remains open. Production
remains explicitly out of scope without separate functional-deploy and
UI-replacement approvals.
