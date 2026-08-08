# Staging 0050 — legal source Vectorize indexing

Date: 2026-07-31 (Cloudflare control-plane timestamps).

## Change

Migration `0050_legal_source_vector_indexing.sql` was applied only to D1
`juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`). It replaces the
published-chunk update guard with a narrower rule: source text, hashes,
metadata and identity remain immutable; only the deterministic
`vec_<chunk-id>` and a non-empty `indexed_at` may be recorded, and only while
the source version is current and verified.

The staging Worker version is `b805e4ea-4ca8-4dff-80d9-81496cfbd2ce`. It adds
the identifiers-only `legal.index` job on the existing
`staging-legal-sources-sync` queue. Publication atomically creates that
idempotent outbox row; the consumer re-loads current verified state from D1
before sending a bounded batch to the configured server-side embedding model.

## Safety boundaries

- Only a staff-approved, published, current, verified `lex` or `advice`
  version can be embedded.
- Pending review, withdrawn, archived, missing and non-official sources fail
  closed before an embedding request.
- The model is a non-secret variable: `text-embedding-3-large` with explicit
  1536 dimensions. `OPENAI_API_KEY` is read only in the Worker runtime.
- Vector metadata contains source lifecycle identifiers and language only; it
  contains no user data, raw legal text, or secrets.
- A deterministic vector id makes retry after an ambiguous Vectorize write
  safe. D1 is updated only after the Vectorize upsert accepts the batch.

## Evidence

- A pre-migration staging D1 export was created locally and its SHA-256 was
  `20c8f37c3bc227465e081db23e32d525980fdfa78a9a964b80d38aba20cb391e`.
  The temporary export and its signed download location are not committed.
- `wrangler d1 migrations list ... --env staging` returned no pending
  migrations after applying `0050`.
- `staging-lex-uz` reads as `1536` dimensions with `cosine` metric.
- The staging D1 count at verification time was `0` legal source chunks and
  therefore `0` indexed chunks. No provider or Vectorize write was made from
  staging data.
- Local lifecycle integration tests prove a staff-published source receives a
  1536-dimensional synthetic embedding, deterministic Vectorize upsert, D1
  bookkeeping, and valid publication replay.

## Known limitation / next gate

There is no legal-team-approved staging publication yet, so successful remote
embedding/indexing must wait for that independent review gate. A direct
Cloudflare CLI read of `staging-advice-uz` returned authentication error 10000,
although its binding was accepted by the Worker deployment. This must be
rechecked with Cloudflare before an approved Advice source is processed; no
claim of Advice runtime indexing is made here.
