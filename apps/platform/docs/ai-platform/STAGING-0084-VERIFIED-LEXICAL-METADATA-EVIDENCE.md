# Staging 0084 — verified legal lexical metadata retrieval

## Scope

This change expands candidate matching for the existing verified legal-source
retrieval path. It does not create or publish legal sources, relax review gates, or
modify production data.

## Behaviour

- Legal-source candidate lookup matches the official act title and act identifier.
- It also matches a section's canonical reference, article number and heading, then
  its body text.
- The query retains short numeric terms only for bounded official identifiers of one
  to ten digits.
- Returned evidence remains restricted to current, published, staff-approved and
  verified Lex/Advice source versions; citation validation remains server-side.

## Local verification

2026-08-02:

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 91 tests, 0 failures.
- The legal-source trust test covers `Закон 205, статья 1` and asserts the identifier
  tokens are preserved.
- The platform-core contract test verifies all official metadata fields participate
  in lexical candidate matching.

## Staging verification

2026-08-02:

- Worker: `juro-platform-staging`.
- Active version: `44724a74-add6-4fee-8337-57f15b6068a3`.
- Deployment: `0c98128f-e26e-466b-9cdc-fe5b3bd3896a` at
  `2026-08-02T07:32:46.428766Z`.
- Cloudflare reports the version at 100% traffic.
- No D1 migration, R2 mutation or production deployment was part of this release.

Cloudflare Access protects the staging URL, so an authenticated browser retrieval
check is intentionally not claimed here. The worker deployment and artifact checks
are independently verified; a real legal answer still requires published, reviewed
source rows in the staging corpus.

## Limits

This is retrieval infrastructure, not a claim that the staging legal corpus is
complete or current. A query can cite only source material that has actually passed
the existing legal review and publication lifecycle.
