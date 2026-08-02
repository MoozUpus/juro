# Staging 0085 — Unicode-safe verified legal retrieval

## Scope

This release corrects lexical candidate matching for Russian and Uzbek official
legal text. It does not change source state, ingestion, publication, D1 schema,
R2 objects or production.

## Cause and resolution

SQLite's `lower()`/`NOCASE` handling is ASCII-oriented. A user query such as
`договор` could therefore fail to match official metadata stored as `Договор`.
The retrieval boundary now produces a small deduplicated set of lower-case,
title-case and upper-case patterns for each bounded query token and applies them
to official act metadata and verified section text.

## Security invariants retained

- Candidate rows must still belong to the active, current, published,
  staff-approved and verified source version.
- Query locale, jurisdiction, evidence and citation validation remain server-side.
- Numeric identifiers are bounded to one through ten digits; no raw user SQL is
  interpolated.
- The change uses D1 bound parameters only.

## Local verification

2026-08-02:

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 91 tests, 0 failures.
- Tests prove Cyrillic `договор` produces `договор`, `Договор` and `ДОГОВОР`;
  numeric identifiers remain a single bounded exact pattern.

## Staging verification

2026-08-02:

- Worker: `juro-platform-staging`.
- Active version: `d772081c-52d0-418c-a0c9-c38075209f50`.
- Deployment: `1c1fe32b-8742-4252-a5e0-32255f885078` at
  `2026-08-02T07:43:21.524499Z`.
- Cloudflare reports this version at 100% traffic.
- No D1 migration, R2 mutation, secret update or production deploy occurred.

Cloudflare Access-protected browser verification is not claimed by this file until
an authenticated session is available.
