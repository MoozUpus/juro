# Legal source synchronization

Status: the first Lex acquisition and normalization vertical slice is implemented and proven in owner-only staging. Publication, retrieval, and AI use remain fail-closed pending explicit legal review.

## Allowed sources

The acquisition classifier accepts only exact HTTPS document routes on lex.uz and www.lex.uz. The canonical ID must equal the final URL suffix. Advice ingestion is disabled by configuration and fails before a network request. Other hosts, credentials, fragments, unrelated routes, private addresses, and cross-source redirects are rejected.

## Acquisition policy

Each request is an idempotent legal_source_fetch_requests row plus an identifiers-only legal.sync outbox envelope. The five-minute scheduled dispatcher is locked and fenced. The legal-source Queue consumer runs with maximum concurrency one and a dedicated dead-letter queue.

Before retrieving a document the worker:

1. fetches the source host robots.txt with a bounded text/plain-compatible Accept header;
2. parses user-agent, Allow, Disallow, and Crawl-delay rules;
3. fails closed on unavailable, invalid, disallowed, or excessive-delay policy;
4. waits a supported Crawl-delay before the document request;
5. follows only bounded same-source HTTPS redirects;
6. validates content type, content encoding, byte limit, and canonical identity;
7. hashes the exact bytes and persists the raw object to private R2 under a content-addressed key.

Current supported Crawl-delay maximum is 60 seconds. Lex currently declares 20 seconds. Queue execution is serial so one batch does not bypass the delay.

## Normalization

legal.sync creates a pending_review version and a low-confidence human review item, then enqueues legal.parse. The parser uses parse5, excludes hidden/site chrome, recognizes ordinary semantic HTML, and activates a Lex-specific block adapter only when official lx_elem blocks are present. ACT_TITLE is the authoritative Lex document title. Wrapper elements are not emitted as duplicate blocks.

The normalized JSON is schema-validated, content-addressed, and written to private R2. D1 stores only its object key and hash evidence. A parser error creates safe failure/review evidence and never creates a false success.

## Publication boundary

Acquisition and parsing never make a source legally verified. A version remains pending_review until a protected legal reviewer examines immutable raw and normalized evidence and records an explicit decision. Only the publication service may create reading sections/chunks and activate current evidence. Automatic publication and automatic Vectorize indexing are absent.

AI routes filter for exact verified source state, verified timestamp, and content hash. Fetched or pending-review sources are not eligible.

## Staging proof

STAGING-0036-EVIDENCE.md records the exact migration, Worker version, D1/R2 hashes, live Lex probe, one-run idempotency evidence, restore drill, tests, limitations, and production boundary.

## Next legal-knowledge slices

- protected reviewer browser flow and an owner-approved reviewer identity;
- approved publication to immutable sections/chunks;
- multilingual RU/UZ source version model;
- Advice acquisition after a separate policy/robots review;
- lexical plus semantic retrieval with tenant-independent public-source filters;
- server-side citation existence/status/effective-date verification;
- scheduled midnight Asia/Tashkent synchronization and source-health alerts;
- reproducible 250-scenario RU/UZ legal evaluation with human-reviewed ground truth.

None of these remaining items is represented as working until its own staging evidence passes.

