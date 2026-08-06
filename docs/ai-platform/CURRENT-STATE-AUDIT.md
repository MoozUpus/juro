# Current state audit — direct-source transition

Date: 2026-08-06. Scope: local branch `feature/juro-ai-platform`, configured
staging, and existing repository evidence. No production mutation was made.

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
| AI chat | PARTIAL | Direct retrieval is locally type-checked and contract-tested; staging migration and authenticated smoke pending. |
| Search and citation validation | PARTIAL | Exact Lex/Advice URLs, bounded fetches and parsed excerpts implemented; no full-page persistence. |
| Document builder | VERIFIED_WORKING | Existing staged implementation preserved, untouched by this slice. |
| Document analysis / comparison | VERIFIED_WORKING | Existing implementation preserved; authenticated regression pending. |
| Cases / action plan | VERIFIED_WORKING | Direct citations are now included in case aggregation; staging verification pending. |
| Lawyer consultation / profile / marketplace | PARTIAL | Existing staged flows are outside this direct-source change; full E2E pending. |
| Admin / demo payments | PARTIAL | Existing implementation retained; needs isolated staging E2E. |
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
