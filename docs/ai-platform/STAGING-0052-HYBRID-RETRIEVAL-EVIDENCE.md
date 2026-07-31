# Staging 0052 — Hybrid legal retrieval evidence

Date: 2026-07-31 (Asia/Tashkent)

## Deployment

- Environment: staging only.
- Worker: `juro-platform-staging`.
- Deployed Worker version: `d763daac-d819-4e0a-a6c7-c5c8ab87b6ad`.
- The deployment retained the existing server-side secret names, D1, private R2, and four Vectorize bindings.
- `STAGING_SYNTHETIC_PROBES_ENABLED` was checked as `false` in the deployed version.

## Checked behaviour

- `npm run lint` passed.
- `npm run type-check` passed.
- `npm test` passed (88 tests).
- `npm run build:staging` passed its staging artifact validation.
- A remote staging D1 read confirmed that there are currently **zero** current verified publications with indexed chunks in either locale.

The last item is intentional operating evidence: the deployed retrieval must not call OpenAI embeddings or claim semantic coverage while the reviewed legal corpus is empty. It therefore remains in the lexical/no-source path until a legal reviewer publishes and indexes a verified source.

## Remaining live-evaluation precondition

To execute a real semantic retrieval smoke, a legal reviewer must first publish one verified `lex` or `advice` source in staging and let the existing `legal.index` job complete. That source must be a safe synthetic or approved public legal source. This is a data-governance gate, not a missing API secret or a failed deployment.

Production was not deployed or queried.
