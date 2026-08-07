# Current state audit — direct-source transition

Date: 2026-08-07. Scope: local branch `feature/juro-ai-platform`, configured
staging, and current browser evidence. No production mutation was made.

## Finding

The prior AI legal-answer path used `retrieveVerifiedLegalSources`, which
reads the JURO-owned Lex/Advice corpus and requires publication/reviewer
evidence. That is incompatible with the current execution objective. The new
local vertical slice substitutes query-scoped `LexUzProvider`-style and
`AdviceUzProvider`-style direct retrieval through `direct-retrieval.ts`.

The direct path has no D1, R2, Queue or Vectorize dependency. It uses fixed
official search endpoints, exact canonical document URL classification,
bounded fetches, robots/rate policy checks for documents, structural parsing,
content hashing, and an allowlisted source card. Migration 0106 persists only
per-run citation metadata and a bounded excerpt.

## Module status

| Function | Status | Evidence / limitation |
|---|---|---|
| AI chat | VERIFIED_WORKING | On 2026-08-07 an authenticated Chrome session completed both a source-backed structured answer and a no-charge clarification where the direct source did not support the requested conclusion. |
| Search and citation validation | VERIFIED_WORKING | The source panel rendered the direct Advice.uz canonical card `https://advice.uz/ru/document/2620`; exact URLs, bounded fetches and parsed excerpts are used without full-page persistence. |
| Document builder | VERIFIED_WORKING | Existing staged implementation preserved, untouched by this slice. |
| Document analysis / comparison | VERIFIED_WORKING | Existing implementation preserved; authenticated regression pending. |
| Cases / action plan | VERIFIED_WORKING | Direct citations are now included in case aggregation; staging verification pending. |
| Lawyer consultation / profile / marketplace | PARTIAL | Migration `0110` is applied and restore-verified in staging. Pending/restricted profiles are fail-closed for public/request paths; immutable suspend/block/archive/restore actions and localized notification/audit evidence are deployed. The remaining gate is a consented synthetic request → conflict check → scoped grant → lawyer-side decision E2E. |
| Admin / demo payments | PARTIAL | The isolated `juro-admin-staging` Worker (version `0416c908-1eff-4842-9ae7-2fa842ce41ac`) now exposes status-filtered lifecycle controls behind its independent session and platform-side fresh-MFA recheck. The payment demo implementation remains retained; protected browser E2E, cancellation/failure and fresh reviewer-MFA proof remain open. |
| Cinematic Legal Intelligence | PARTIAL | Existing shell retained; changed AI source UI needs visual/accessibility QA. |

## Dormant dependencies and rollback

Staging sets `LEGAL_ADVICE_INGESTION_ENABLED=false`,
`LEGAL_LEX_RSS_DISCOVERY_ENABLED=false`, and
`LEGAL_SOURCE_STAFF_API_ENABLED=false`. Existing corpus tables, R2 objects,
queue bindings and Lex/Advice Vectorize bindings remain untouched and are not
on the new retrieval path. Rollback is application-first: restore the prior
Worker release and re-enable only the existing flags after incident review.

## Beta scope

The owner supplied internal beta acceptance for the existing reviewer decisions
covering 314 legal, 100 document and 30 comparison cases. No additional user,
legal-reviewer assignment, or public access is created by that acceptance.
