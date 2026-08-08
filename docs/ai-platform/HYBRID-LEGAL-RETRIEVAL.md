# Hybrid legal retrieval

## Purpose

`AI-юрист JURO` and the asynchronous document-analysis worker now combine exact lexical matching with semantic candidate matching. This is a retrieval enhancement only: it does not let Vectorize decide legal truth or bypass legal-source review.

## Safe flow

1. The service checks D1 for at least one current, verified, staff-published and indexed source in the requested locale.
2. Only then does it create a server-side OpenAI embedding for the query and query both `LEX_UZ_INDEX` and `ADVICE_UZ_INDEX` with `environment` and `language` metadata filters.
3. Vectorize supplies deterministic `vec_<chunkId>` candidates only.
4. D1 reloads each candidate from the active publication, then validates the full immutable section/chunk set, hashes, review publication and lifecycle evidence.
5. Only revalidated excerpts can become `LegalSourceContext` for the provider prompt.

Exact lexical candidates remain in the same query. If no indexed source exists, OpenAI embeddings is unavailable, or Vectorize fails, the service uses lexical retrieval and reports `retrievalMode: "lexical"`; it never creates an unsupported citation.

## Historical applicability

An explicit legal context date uses lexical retrieval only; semantic similarity is not allowed to select a historical edition. The date is interpreted from the user-visible Uzbekistan calendar at `00:00 Asia/Tashkent`. A candidate must carry immutable reviewer applicability evidence. For a replaced edition, the validator also verifies the replacement lifecycle and successor applicability evidence, then uses the earlier of the reviewed expiry and successor effective date. Invalid, missing or tampered evidence removes the candidate rather than weakening the answer.

## Boundary

- `OPENAI_API_KEY` is read only in the Worker/server runtime and never enters a client bundle.
- Vector metadata contains only lifecycle identifiers and locale; it contains no user content or tenant data.
- Source authorization/trust is enforced after retrieval in D1, not delegated to metadata filtering.
- Public source vectors are separate from the user-document vector index.

## Validation

- `tests/legal-semantic-retrieval.test.ts` validates missing-binding, filtered dual-index and provider-failure paths.
- Existing legal-source review and document-analysis processor tests cover the immutable publication and provider input boundaries.
- Live semantic retrieval is intentionally inactive until a legal reviewer publishes and indexes current source material. This avoids avoidable embedding spend and prevents claims that an empty corpus has semantic coverage.
