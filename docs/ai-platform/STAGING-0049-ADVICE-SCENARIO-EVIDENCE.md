# Staging evidence — Advice scenario persistence (migration 0049)

Date: 2026-07-31 (Cloudflare staging run)

Scope: `juro-staging` only. No production resource, public route, user content, or publication state was changed.

## Applied change

Migration `0049_advice_scenario_domain.sql` adds the review-only `advice_scenarios` and `scenario_versions` domain. The normalizer writes an Advice scenario only after an existing public Advice source version has been parsed successfully. Every created record starts as `pending_review`; it is not indexed for retrieval and is not eligible for an AI legal answer.

## Remote verification

- D1 database: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)
- Worker version: `2f55bcf9-b3b5-42e2-9659-4ec3b69cd1f4`
- Queue: `staging-legal-sources-sync`
- Cron run: `2026-07-31T20:55:02.000Z`, completed without an error.
- Replayed public source versions completed through the normal queue consumer:
  - RU canonical Advice scenario `1744`
  - UZ canonical Advice scenario `624`
- Both resulting scenario and scenario-version rows have status `pending_review`.

## Safety boundary

The two rows are evidence for persistence and queue wiring only. They remain unavailable to publication, retrieval, and the AI-lawyer response path until a staff review and an explicit publication workflow are implemented and verified.

## Local verification

The migration-safety and legal-source-normalization suites verify migration inventory, idempotency, and Advice persistence. Full regression, build, artifact validation, and secret scan must be recorded separately for any follow-up code change.
