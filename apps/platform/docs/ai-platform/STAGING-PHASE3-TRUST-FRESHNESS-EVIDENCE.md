# Staging Phase 3 trust and freshness evidence

Date: 2026-07-31
Scope: owner-protected staging only

## Exact change

- deployed code commit: `af1b0bf`;
- branch: `feature/juro-ai-platform`;
- Worker: `juro-platform-staging`;
- version: `37687899-f17a-4bdf-9f9c-41c6b509cfb9` at 100%;
- application rollback: `ffbfe9df-40f8-4442-8080-7eaf1e63fe40`;
- production Worker `juro`: unchanged at
  `91774ed4-72e9-47bb-b93a-a4208d490b24`.

No migration, dependency, Cloudflare resource, binding, Queue policy, secret,
`apps/website` file, production schema, or production deployment changed.

## Implemented boundary

- only successful `initial_corpus`, `scheduled_corpus`, or `manual_corpus` runs
  for both Lex and Advice establish freshness;
- the database `asOf` is the older latest successful timestamp;
- missing, invalid, future, single-page, failed, or partial evidence is
  `unavailable`; more than seven days is `stale`;
- every retrieved source replays exact current source/version/publication/
  lifecycle activation, evidence JSON/SHA-256, actor/time linkage, effective
  dates, expiry, and every immutable section/chunk hash before prompt inclusion;
- `unavailable` chat responses have no confirmed findings or citations and are
  non-chargeable clarification states;
- `unavailable` document analysis removes legal-compliance risks, missing-clause
  proposals, citations, and unverified recommendations while retaining bounded
  document-internal findings;
- `stale` findings become assumptions or low-confidence results, deadlines are
  preliminary, and RU/UZ warnings plus lawyer review are shown;
- indexed reading rows remain eligible for the future hybrid retrieval layer;
  vector metadata does not weaken content-evidence verification.

## Local release gate

Passed on the exact code source:

- type-check and lint;
- 10 targeted trust/document-analysis tests;
- full regression: 29 rendered route/security, 329 core, and 84 Cloudflare
  tests, all passing;
- generated Cloudflare binding type check;
- development/staging/production-profile matrix validation;
- staging build and exact artifact validation;
- document-builder smoke: 34 scenarios with real DOCX/PDF/ZIP output;
- document-comparison smoke: three changes with real PDF/DOCX output;
- `git diff --check`;
- filenames-only source/artifact scan: no provider-secret-shaped values and no
  forbidden public secret binding names.

GitHub CI for commit `af1b0bf` passed both `validate (apps/platform)` and
`validate (apps/website)`.

## Deployment and control-plane read-back

The staging artifact passed a Wrangler strict dry run and was deployed with
`--keep-vars --strict` using the flattened staging config and the exact Worker
name. Version read-back proves message `af1b0bf legal source freshness gate`,
handlers `fetch`, `queue`, and `scheduled`, compatibility date `2026-07-26`,
`nodejs_compat`, and the existing D1/R2/Vectorize/Queue/Analytics/Images/Assets
bindings.

Secret-name read-back contains only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and
`TURNSTILE_SECRET_KEY`; no value was read. `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY` are absent, so no live provider response is claimed.

Remote `juro-staging` read-back proves:

- no pending migration;
- 42 migration ledger rows;
- `PRAGMA quick_check = ok`;
- zero foreign-key violations;
- zero qualifying Lex/Advice full-corpus runs.

Anonymous requests to the staging root and `/api/platform/ai` receive Cloudflare
Access `302` with `no-store`. The production canonical builder URL still returns
private canonical/auth routing `307`.

## Honest runtime state and rollback

Because qualifying corpus evidence is zero, the runtime legal-database state is
`unavailable`. This deployment proves fail-closed behavior and infrastructure
integrity; it does not prove corpus freshness, live OpenAI/Anthropic execution,
legal correctness, or the 250+50 evaluation gate.

For an application regression, restore staging traffic to
`ffbfe9df-40f8-4442-8080-7eaf1e63fe40`. D1 rollback is unnecessary because the
slice has no migration. Production deployment and production UI replacement
remain separate unauthorized actions.
