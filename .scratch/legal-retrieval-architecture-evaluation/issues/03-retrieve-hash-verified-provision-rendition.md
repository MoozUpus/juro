# 03: Retrieve one hash-verified Provision Rendition

**What to build:** Move one representative current official provision through the complete target path: immutable R2 evidence, body-free legal-D1 identity and locator records, private retrieval, hash verification, and an Official Citation. This is the first end-to-end evidence tracer and must not switch general retrieval.

Blocked by: 02

Status: ready-for-agent

- [x] One Legal Instrument, Official Expression, Text Revision, Provision Concept, and Provision Rendition can be imported idempotently into target storage.
- [x] Raw capture, normalized revision, and provision objects use deterministic immutable keys and versioned serialization.
- [x] Legal D1 stores identity, structure, R2 keys, byte counts, media types, and SHA-256 values but no canonical body text.
- [x] The private read Interface returns the provision only after validating its R2 size and hashes; provider or database excerpts cannot substitute for evidence.
- [x] A different-byte overwrite, missing object, size mismatch, content-hash mismatch, or source-hash mismatch fails closed as Source Unavailability.
- [x] The resulting Official Citation remains tied to the validated public Lex source and immutable evidence identity.
- [x] Tests observe the complete import/read/citation behavior through the existing private retrieval seam.

## Comments

### Post-review correction verification (2026-08-30)

- Added publisher-stable Instrument and Provision tokens plus D1 natural-identity constraints for Instruments, Official Expressions, Text Revisions, Provision Concepts, and Provision Renditions. Reusing a stable publisher token with a different incidental ID now fails before any R2 write; the idempotent import test also proves the failed conflict leaves the object inventory unchanged.
- Current eligibility is no longer inferred merely because textual authority is known. A current read requires both an eligible current decision and a separately recorded official current pointer; raw hash-verified evidence reads remain available without manufacturing temporal eligibility.

**Verification (2026-08-30):**

- Added body-free legal identity/locator/eligibility tables in `legal-drizzle/0002_official_evidence.sql` and deterministic immutable raw, normalized-revision, and Provision Rendition serialization in `target-evidence.ts`.
- The importer uses create-only R2 writes with SHA-256 metadata and readback verification before atomically recording locators; repeated identical imports return the same identities, while a different-byte object at an immutable key is rejected.
- The private Official Evidence service-binding read hydrates the provision and normalized revision from R2, checks recorded bytes, content hash, source-normalized hash, complete identity, Official Eligibility, and the validated Lex URL before returning text and an Official Citation.
- Red/green evidence: the seam test initially failed with `ERR_MODULE_NOT_FOUND`; after implementation, `legal-target-evidence.test.ts` passed 6/6, covering idempotency, overwrite rejection, missing object, size, content-hash, and source-hash corruption.
- Platform type-check and the legal Worker dry-run passed; the target evidence/storage plus Worker-boundary regression group passed 23/23. No remote resource was mutated.
