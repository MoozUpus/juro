# Own hybrid official-corpus retrieval

Status: accepted — 2026-09-03; Batch transport amendment accepted 2026-09-04; supersedes ADR 0004's selection of Cloudflare AI Search

JURO will own Hybrid Candidate Fusion for the Indexed Official Corpus. Immutable application-built BM25 lexicons, postings and corpus statistics live in private R2; application-generated `text-embedding-3-large` representations live as reusable private R2 artifacts and in an off-side Cloudflare Vectorize index; the existing private `LegalCandidateIndex` Interface returns one complete Candidate Packet only after every declared sparse and dense lane participates. This replaces AI Search because its opaque, slow indexing and provider-owned chunking prevent JURO from meeting deterministic release, laptop-independent recovery and freshness requirements, while putting sparse postings in D1 would recreate the non-increasable 10 GB capacity risk.

## Consequences

- One Search Release pins an immutable Corpus Snapshot, JURO-owned Retrieval Chunk policy, sparse artifact set, dense artifact set, Vectorize index, embedding model/dimensions, metadata/filter policy and RRF policy. Sparse and dense components seal and activate together; a partial lane is Source Unavailability.
- R2 is authoritative for immutable BM25 artifacts, reusable document embeddings and exhaustive release inventories. Vectorize is disposable. D1 retains legal facts, minimal candidate-to-evidence mappings, release roots, gates, Activation Sets and rollback history, but no bodies, term dictionaries, postings, positions or vectors. A projected 7 GB D1 size blocks a release until a sharding plan exists.
- JURO uses unweighted reciprocal-rank fusion with `k = 60`. If both word and character n-gram sparse analyzers are required by evaluation, they first fuse into one Sparse Candidate Lane so sparse retrieval does not receive two votes against the Dense Candidate Lane.
- Retrieval Chunks are deterministic, provision-owned and provider-independent. Document and query embeddings use the same explicitly pinned 1,536-dimensional representation and transformation. Query embeddings are request-local and never persisted.
- A private Workflow coordinates each build; bounded Queue consumers perform idempotent posting, manifest and provider-lifecycle work; a Container may perform deterministic external sort/reduce only when a representative prototype proves Worker limits inadequate. Large state and every restart checkpoint live in R2.
- Offline document embeddings use OpenAI Batch only. The builder deduplicates
  deterministic structured inputs and reuses hash-verified R2 artifacts before
  uploading JSONL, then submits only unique missing hashes through the
  environment's authenticated, logging/cache-disabled AI Gateway. It reconciles
  every output/error by content-free custom ID, persists verified embeddings to
  R2 before Vectorize, and deletes provider Files after durable reconciliation.
  A synchronous document-embedding fallback is forbidden.
- Live privacy-transformed query embeddings remain synchronous and request-local
  because an offline completion-within-24-hours job cannot serve or measure an
  interactive retrieval request. A four-hour emergency response may reuse an
  existing exact embedding or fail over to Live Official Search; it may not
  bypass Batch to create a new document embedding or claim a complete hybrid
  release before both lanes reconcile.
- The same owner-approved OpenAI key may serve staging and production, but each environment stores it independently behind a distinct authenticated, logging-disabled and cache-disabled AI Gateway. The root Cloudflare bootstrap token remains only in the ignored root `.env` until the migration program is resolved, then is scrubbed after verified final readback and revoked by the owner.
- AI Search's partial Porter/trigram build remains non-authoritative historical evidence. Its corpus projection, token measurements and privacy observations may inform the replacement, but its reconciliation, evaluation and soak cannot qualify the custom backend.
- Question Interpretation, Retrieval Eligibility, D1 revalidation, hash-verified R2 hydration, Provision Set selection, Official Coverage, the strict Source Ladder and Legal Answer behavior do not change.
