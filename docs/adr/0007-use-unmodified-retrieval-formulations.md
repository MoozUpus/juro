# Use unmodified retrieval formulations

Status: accepted — 2026-09-08

JURO sends each request-local Retrieval Formulation unchanged to both the Sparse Candidate Lane and the OpenAI-backed Dense Candidate Lane so redaction, substitution or content rejection cannot make the two searches diverge or reduce retrieval quality. JURO does not persist formulations or query embeddings and keeps AI Gateway payload logging and caching disabled, but accepts the standard provider processing and retention terms—including possible abuse-monitoring retention—without making ZDR, MAM, disclosure or DPA approval an activation gate; users remain responsible for the content they submit, and this product policy is not a legal-compliance conclusion.

## Consequences

- Retrieval does not redact names, contacts, account data, secrets or other user content and does not reject a formulation based on its content.
- Existing legal evidence, Retrieval Chunks and document embeddings are unchanged; only live query handling changes.
- An unobtrusive provider-processing notice is deferred to separately tracked UI work and does not block search activation.
