# 06: Search one current release through AI Search

**What to build:** Add an AI Search Adapter at the existing LegalCandidateIndex seam and run the activated current tracer through it in shadow mode. Qdrant/D1 remains the visible Adapter and immediate rollback path.

Blocked by: 05

Status: ready-for-agent

- [x] LegalCandidateIndex accepts a Question Interpretation, one Temporal Endpoint, and a pinned Search Release and returns no legal conclusion.
- [x] AI Search returns stable item locators, instance/shard identity, vector and keyword ranks/scores, matched reading/requirement identity, partial errors, and availability.
- [x] The Adapter requests at most 50 results per formulation with vector threshold zero and deterministically normalizes/deduplicates candidates.
- [x] Missing required instances, partial namespace errors, unknown instances, wrong-release results, or configuration drift invalidate the complete Candidate Packet.
- [x] Candidate text is used only as a locator; the Provision Rendition is still resolved and hash-verified through ticket 03's evidence path.
- [x] Contract tests run the same observable suite against AI Search, Qdrant/D1, and an in-memory Adapter.
- [x] Shadow execution cannot change visible answers, Citations, Source Ladder decisions, or latency budgets for the active Adapter.

## Comments

**Verification (2026-08-30):**

- Added the provider-neutral `LegalCandidateIndex`, AI Search, Qdrant/D1, and in-memory Adapters plus detached shadow execution in `legal-candidate-index.ts`; the public packet contains locators and retrieval diagnostics only, never provider text or a legal conclusion.
- The AI Search Adapter attests pinned model/dimensions/tokenizer/metadata configuration, searches deterministic waves of at most ten instances, requests 50 results with threshold zero, and preserves all formulation-to-reading/requirement mappings through deterministic deduplication.
- Any explicit partial response, absent required namespace, unexpected namespace/hit, shard or release-prefix mismatch, configuration drift, or provider exception returns one unavailable packet with no candidates. Provider candidate text is discarded, leaving ticket 03's R2 locator hydration and hash verification as the only evidence path.
- Red/green evidence: the first contract test failed because the module did not exist; the expanded integrity suite then exposed a duplicate-fixture collision and rank expectation, which were corrected without weakening the 50-result cap.
- Candidate contract/integrity/shadow tests passed 11/11; the final combined candidate/evidence/storage/release/Worker regression run passed 26/26, platform type-check passed, and the legal Worker dry-run built successfully. No remote resource was mutated.
