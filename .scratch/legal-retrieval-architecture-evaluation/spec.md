# Complete official-corpus R2/D1 and AI Search migration

Status: ready-for-agent

Decision state: accepted

Research date: 2026-08-30

Durable decisions: [ADR-0004](../../docs/adr/0004-use-ai-search-for-official-corpus-candidates.md), [target architecture](../../docs/legal-corpus/target-search-architecture.md), and [JURO domain language](../../CONTEXT.md).

## Problem Statement

JURO cannot safely complete and operate its Indexed Official Corpus on the current storage and retrieval architecture. Official legal bodies, identity and relationship metadata, sparse postings, release state, and application data compete inside the platform D1 database, which is already close to Cloudflare's non-increasable size limit. The current Qdrant candidate index is operationally fragile, has lost indexed points after sleeping, requires bespoke snapshot/reconciliation machinery, and has not passed the production promotion latency gate.

The existing model also cannot reliably answer the full legal question set JURO promises. It treats editorial revisions as legal applicability, lacks stable Provision Concept identity and persisted split/merge/renumbering lineage, supports only current law or one as-of date, and does not distinguish a Controlling Text from an Official Translation. Candidate bodies are hydrated from D1 instead of immutable R2 evidence, while historical hybrid retrieval and history-versus-history comparisons are not genuinely implemented.

Without a complete migration, JURO risks silently mixing legal periods, treating translations as co-controlling, omitting applicable provisions through stale or mismatched indexes, exposing sensitive case wording to provider logging, exhausting D1 capacity, and returning a Legal Answer from evidence that cannot be reproduced and hash-verified.

## Solution

Move the complete official legal corpus to an evidence-first architecture:

- A dedicated R2 bucket owns every immutable raw capture, normalized Text Revision, Provision Rendition, Corpus Snapshot mirror, Search Release artifact, and release manifest.
- A dedicated legal D1 database owns legal identity, Official Expression authority, Applicability Periods, Provision Concept lineage and equivalence, provenance, R2 locators and hashes, Official Eligibility, Corpus Snapshots, Search Releases, gates, Activation Sets, and rollback state. It stores no canonical legal body text.
- A private route-free legal-corpus Worker owns legal D1, legal R2, and AI Search access. The platform reaches it through the existing private service-binding seam.
- Cloudflare AI Search supplies disposable hybrid sparse+dense candidates only. JURO revalidates every candidate in legal D1, hydrates immutable R2 evidence, verifies byte counts and hashes, resolves the Controlling Text, constructs the Provision Set, evaluates Official Coverage, and continues the Source Ladder when indexed retrieval is insufficient or unavailable.
- Current, point-in-time, and arbitrary two-endpoint comparison capabilities use compatible immutable Search Releases selected by an atomic Activation Set. Current search may activate before history; unsupported capabilities continue to Live Official Search.
- The existing Qdrant and platform-D1 corpus projection remain available for rollback through staged migration, production canary, stability, and restore gates. They are retired only after complete activation has been stable for 90 days and an isolated restore rehearsal passes.

The feature is complete only when production current, as-of, and comparison retrieval are active on the target architecture, all required stability windows and recovery rehearsals have passed, legacy Qdrant and platform-D1 body/posting machinery has been retired, and immutable R2 evidence remains reproducible.

## User Stories

1. As a person asking about current Uzbekistan law, I want JURO to search the complete current official corpus, so that superseded rules do not distort my Legal Answer.
2. As a person asking what the law was on a particular date, I want JURO to use only provisions supported as applicable at that instant, so that current law is not presented as historical law.
3. As a person comparing two historical dates, I want JURO to resolve each date independently, so that I can understand how the law changed without assuming one endpoint is current.
4. As a person comparing current and historical law, I want separate Provision Sets for each endpoint, so that conflicting versions are never merged into one proposition.
5. As a person whose requested date is ambiguous, I want JURO to ask a focused question or give clearly separated Conditional Answers, so that it does not guess the Temporal Scope.
6. As a Russian-speaking user, I want JURO to discover relevant Russian expressions while verifying material propositions against the Controlling Text, so that my answer is accessible without changing which text controls legally.
7. As an Uzbek Latin reader, I want citations to preserve the certified expression and its script, so that a generated transliteration is not mistaken for official evidence.
8. As a researcher working with an older Uzbek Cyrillic act, I want the certified historical Cyrillic expression to remain controlling for its revision, so that a modern script preference does not rewrite the source.
9. As an English-speaking user, I want English text labeled as a translation and paired with controlling evidence when available, so that translation convenience is not confused with legal authority.
10. As a user, I want any explanatory translation visibly distinguished from the stored official quotation, so that I can tell source evidence from JURO's presentation.
11. As a user asking a General Legal Question, I want JURO to cover every material Plausible Reading, so that one high-scoring passage cannot crowd out conditions, exceptions, procedures, or remedies.
12. As a user with unresolved Case Facts, I want separately supported outcomes and only material follow-up questions, so that JURO produces a Conditional Answer rather than an unsupported guess.
13. As a user whose question is too broad for the bounded evidence context, I want clarification or an Insufficient-Evidence Result, so that relevant provisions are not silently truncated.
14. As a user, I want Source Unavailability distinguished from absent Official Coverage, so that an index outage is never presented as proof that no applicable law exists.
15. As a user, I want Live Official Search to continue the Source Ladder when an indexed capability is unavailable, so that a staged migration does not remove access to official evidence.
16. As a user, I want exact act-and-provision citations resolved deterministically, so that clear citation requests do not depend on semantic ranking.
17. As a user who combines an exact citation with general facts, I want JURO to retrieve surrounding rules and exceptions as well, so that the cited article is not treated as the complete analysis by itself.
18. As a privacy-conscious user, I want names, contacts, addresses, identifiers, secrets, payment data, and irrelevant narrative removed before provider-bound retrieval, so that my case details are minimized.
19. As a user, I want the exact-query branch to preserve my legally material wording after privacy transformation, so that retrieval quality is maintained without sending raw personal text.
20. As a user whose input contains a secret that cannot be safely transformed, I want indexed vector retrieval rejected rather than transmitted, so that credentials or payment data never reach the provider.
21. As a legal-corpus operator, I want every official source capture stored immutably in R2, so that the evidence underlying a Citation can be reproduced.
22. As a legal-corpus operator, I want normalized Text Revisions and Provision Renditions stored separately, so that JURO can hydrate only the precise evidence required for a Legal Answer.
23. As a legal-corpus operator, I want idempotent evidence writes to reject different bytes at an existing immutable key, so that corrections create new evidence instead of rewriting history.
24. As a legal-corpus operator, I want D1 to store R2 keys, byte counts, and hashes, so that every hydrated object can be verified before use.
25. As a legal-corpus operator, I want complete R2/D1 reconciliation, so that missing, extra, or mismatched evidence blocks promotion.
26. As a legal-data curator, I want a stable Legal Instrument across languages and revisions, so that provider IDs and route prefixes do not fragment identity.
27. As a legal-data curator, I want each Official Expression to record language, script, textual authority, origin, publication status, derivation, and authority evidence, so that translations are not silently treated as controlling.
28. As a legal-data curator, I want the full publisher revision token preserved, including same-day suffixes, so that distinct official revisions do not collide.
29. As a legal-data curator, I want editorial validity separated from substantive Applicability Periods, so that a publisher revision date is not assumed to be a legal commencement date.
30. As a legal-data curator, I want stable Provision Concepts and many-to-many lineage, so that renumbering, movement, amendment, split, merge, and repeal remain traceable.
31. As a legal-data curator, I want unknown or disputed applicability recorded as a Temporal Coverage Gap, so that uncertainty remains explicit and cannot qualify historical evidence.
32. As a release operator, I want immutable Corpus Snapshots, so that every Search Release has a reproducible source selection and corpus hash.
33. As a release operator, I want separate current and history Search Releases, so that current capability can activate without pretending historical coverage is ready.
34. As a release operator, I want comparison activation to require current and history releases from the same Corpus Snapshot, so that endpoints use compatible legal identity and lineage.
35. As a release operator, I want one atomic Activation Set transaction with a recorded prior set, so that activation and rollback cannot leave capabilities half-switched.
36. As a release operator, I want deterministic current and historical shards with complete disjoint-union proof, so that every eligible provision is indexed exactly once per intended projection.
37. As a release operator, I want Porter and trigram candidates evaluated on the same multilingual matrix, so that tokenizer choice is evidence-based.
38. As a release operator, I want measured embedding tokens and cost recorded before upload, so that provider spend is bounded before indexing begins.
39. As a release operator, I want hard current, complete-migration, and monthly query circuit breakers, so that a retry or configuration error cannot create unbounded spend.
40. As a release operator, I want every provider instance attested for model, dimensions, tokenizer, metadata, source prefix, Gateway identity, logging, caches, route exposure, and pause state, so that configuration drift fails closed.
41. As a release operator, I want 100% item and metadata parity, so that AI Search filters cannot hide eligible evidence through an unnoticed schema mismatch.
42. As an on-call operator, I want any partial namespace response, missing shard, unknown key, wrong-release key, or R2 mismatch to invalidate the whole indexed packet, so that partial evidence is not mistaken for complete coverage.
43. As an on-call operator, I want content-free telemetry for release identity, counts, tokens, latency, safe status, and error class, so that failures are diagnosable without logging legal queries or evidence.
44. As a privacy officer, I want dedicated environment-specific Gateways and provider projects with payload logging and caches disabled, so that environments remain isolated and query retention is minimized.
45. As a privacy officer, I want production query embedding blocked until the accepted disclosure/DPA and ZDR/MAM evidence exist, so that production processing matches JURO's privacy commitment.
46. As a security reviewer, I want the legal-corpus Worker to have no public route and reject unpinned or cross-environment releases, so that corpus control cannot be invoked from the public internet.
47. As a reliability owner, I want current releases available within 24 hours of a validated official change and an emergency four-hour path, so that indexed current law does not remain silently stale.
48. As a reliability owner, I want historical discovery and lineage reconciliation to run at least weekly, so that newly discovered historical evidence becomes eligible predictably.
49. As a quality owner, I want every required evaluation stratum and numeric threshold machine-enforced, so that average relevance cannot conceal a failed legal branch.
50. As a quality owner, I want staging to remain green for 14 days and 10,000 shadow or synthetic requests, so that a small one-time evaluation is not treated as operational proof.
51. As a production owner, I want a 30-day canary before complete activation, so that rollback remains available during real production observation.
52. As a production owner, I want complete activation stable for 90 days and an isolated restore rehearsal before retirement, so that legacy recovery paths are not removed prematurely.
53. As a backup operator, I want verified D1 exports, R2 inventories, Qdrant snapshots, and configuration captures before every mutable remote stage, so that each migration step has a tested rollback point.
54. As an auditor, I want immutable gate, activation, rollback, cost, privacy, and reconciliation evidence, so that the history of a Legal Answer's retrieval system can be reconstructed.
55. As an engineer, I want AI Search and Qdrant to satisfy the same LegalCandidateIndex Interface during migration, so that provider selection changes without spreading legal policy across callers.
56. As an engineer, I want provider candidate text treated only as a locator, so that all quoted evidence comes from hash-verified R2 objects.
57. As an engineer, I want private user documents to remain on their access-controlled storage and retrieval path, so that resemblance to legislation cannot make private text part of the Indexed Official Corpus.
58. As a maintainer, I want legacy platform-D1 body and posting writes stopped before schema removal, so that final retirement is a forward, observable transition.
59. As a maintainer, I want Qdrant containers, snapshots, reconciliation jobs, and configuration retired only after the rollback obligation ends, so that operational complexity is removed safely.
60. As a future maintainer, I want immutable R2 evidence and reproducible Search Release manifests retained after derivative indexes are deleted, so that past Citations remain auditable.

## Implementation Decisions

### Module seams

- The primary retrieval seam is the existing private legal-corpus service binding used by the Legal Retrieval Orchestrator. It remains the highest externally observable seam for candidate retrieval, D1 revalidation, R2 hydration, Source Ladder behavior, and Legal Answer evidence.
- `LegalCandidateIndex` is the provider seam. Its Interface accepts a Question Interpretation, one Temporal Endpoint, and a pinned Search Release; it returns a Candidate Packet with release/endpoint identity, candidate locators, channel ranks, reading/requirement mappings, partial errors, and availability. It returns no legal conclusion.
- Qdrant/D1 and AI Search are simultaneous Adapters at this seam until the rollback window ends. Provider configuration, shard waves, retries, result normalization, and provider result limits remain behind the Interface.
- `OfficialEvidenceResolver` is the evidence-integrity Module. It owns release membership, Official Eligibility, textual authority, applicability, metadata parity, R2 hydration, byte/hash verification, and controlling-expression resolution. Callers cannot quote provider result text.
- The release-lifecycle Module owns Corpus Snapshot freeze, Search Release sealing, gate evaluation, Activation Set compatibility, atomic activation, and rollback. Callers cannot mutate individual active capabilities.
- Migration verification is an operational seam accepting a source inventory and target inventory and returning reconciliation evidence without exposing internal batch mechanics.

### Storage and schema

- R2 is authoritative for raw captures, normalized Text Revisions, Provision Renditions, Corpus Snapshot mirrors, deterministic search chunks, and Search Release manifests.
- R2 evidence prefixes are immutable and retention-locked. Search chunks are reproducible derivatives and may expire only after their release obligations end.
- Dedicated legal D1 is authoritative for Legal Instruments, source aliases, Official Expressions, Text Revisions, Provision Concepts, Provision Renditions, Applicability Periods, lineage/equivalence/cross-reference edges, Official Eligibility, Temporal Coverage Gaps, Corpus Snapshots, Search Releases, gates, Activation Sets, and activation history.
- The final legal D1 schema contains no canonical body text or sparse posting bodies. Platform D1 retains tenant, workspace, owner, user, and private-document data.
- Every R2 locator records object key, media type, byte count, SHA-256, source-normalized SHA-256 when applicable, ordinal, schema version, and creation time.
- Timestamps are UTC ISO-8601. Legal and editorial intervals are half-open. Full publisher revision tokens remain unique within an Official Expression.
- A Controlling Text requires explicit authority evidence. Unknown textual authority fails Official Eligibility.

### Authority, identity, and temporal behavior

- Existing canonical document identity may seed Legal Instrument identity, but provider IDs, language routes, article numbers, ingestion order, and version-bound provision IDs do not establish stable identity by themselves.
- The certified or adopted state-language Official Expression is the Controlling Text. Russian and English expressions are translations. Uzbek Latin/Cyrillic authority is established per Text Revision from certification or adoption evidence.
- An Official Translation can support discovery and user-language presentation but cannot independently resolve a conflict or silently replace the Controlling Text for a material proposition.
- Editorial Text Revision validity and legal Applicability Periods are separate. Unknown applicability may support current retrieval only through a validated official current pointer; it cannot support point-in-time or comparison evidence.
- Provision lineage is many-to-many and represents unchanged, modified, renumbered, moved, split, merged, and repealed transitions with evidence and review state.
- Temporal Scope is current, one as-of instant, or a comparison whose left and right endpoints are independently current or timestamped. Each endpoint produces its own Provision Set.

### Candidate retrieval and evidence

- AI Search is a disposable hybrid sparse+dense candidate index. Query rewriting, provider reranking, provider generation, context expansion, Gateway caching, and similarity caching remain disabled.
- AI Search metadata occupies four custom fields: language and document type as text, plus valid-from and valid-to as datetime. The fifth field remains reserved. Environment, release, capability, and shard are encoded in provider resource identity and R2 prefix.
- One endpoint search queries every required shard. Deterministic waves never contain more than ten provider instances; global fusion never omits a wave.
- Each formulation requests at most 50 results with vector threshold zero. Candidates are deduplicated by canonical chunk, Text Revision, Provision Concept, and language family without collapsing textual authority.
- Partial provider errors, missing shards, unknown instances, unknown item keys, wrong-release keys, metadata mismatch, byte mismatch, hash mismatch, source-normalized hash mismatch, or configuration drift invalidate the whole indexed packet with zero tolerance.
- D1 applicability is final, but provider metadata parity is a promotion gate because post-retrieval checks cannot recover evidence hidden by a false-negative provider filter.
- At most twelve provisions are hydrated per endpoint. Exceeding the evidence ceiling produces a focused clarification or Insufficient-Evidence Result rather than silent truncation.

### Question Interpretation and privacy

- Every Plausible Reading owns proposition-level Coverage Requirements. Topic-specific synonym tables and hard-coded act/article rules are removed from the general interpretation path.
- The formulation budget is six total, including cross-language recovery and the one repair search. Every Plausible Reading receives one formulation before any receives a second. More than six materially required formulations triggers clarification.
- Comparisons reuse the same formulations separately for both endpoints, allowing at most twelve endpoint-formulation searches.
- Exact wording means exact wording after a deterministic provider-boundary privacy transform. The transform removes direct names, contacts, addresses, personal/account/case/document identifiers, secrets, payment data, and legally irrelevant narrative while preserving material legal statuses, events, and dates.
- Provider-bound raw query text, evidence bodies, vectors, payloads, and user-linked item keys are never stored in telemetry. Only release identity, hashed correlation identity, counts, tokens, latency, safe status, and safe error class are retained.
- Each environment uses a dedicated Gateway and provider project/service key. Production user-query embedding requires accepted disclosure/DPA evidence and approved ZDR/MAM for embeddings.

### Releases, costs, gates, and migration

- A Corpus Snapshot is immutable after freeze. A Search Release is immutable after sealing and records capability, snapshot, provider configuration, shard inventory, item metadata, object hashes, token/cost evidence, privacy/configuration attestations, sync state, reconciliation, evaluation, and gate results.
- Current and history are separate Search Releases. Current may activate alone. As-of requires history. Comparison requires compatible current and history releases from the same Corpus Snapshot.
- Activation Set replacement and rollback are single legal-D1 transactions that preserve the previous set and immutable event history.
- Search artifacts are tokenized before upload. Authorized release cost is measured input tokens multiplied by the accepted provider rate plus 25%. Hard migration caps are USD 50 current and USD 450 complete, including one complete retry. Production query embeddings have a separate USD 25 monthly circuit breaker.
- Required quality thresholds are recall@5 at least 0.90, recall@10 at least 0.95, MRR at least 0.85, citation precision 1.00, citation recall at least 0.95, article exactness at least 0.95, document exactness at least 0.97, abstention correctness at least 0.95, partial-answer correctness at least 0.90, groundedness at least 0.95, zero stale/invalid links, source-unavailability rate at most 0.02, indexed p95 at most 5 seconds, answer p95 at most 30 seconds, and evaluation provider cost at most USD 30.
- Every required stratum in the existing 314-scenario matrix must pass, along with 100% R2/D1/provider reconciliation and zero integrity/configuration errors.
- Staging promotion requires 14 continuous green days and at least 10,000 shadow or synthetic requests. Production complete activation requires a 30-day green canary. Legacy retirement requires 90 green days after complete activation and a successful isolated restore rehearsal.
- Current-law freshness is at most 24 hours after a validated official change, with a four-hour emergency path. Historical discovery and reconciliation run at least weekly.
- Before every mutable environment stage, the existing backup runbook produces a verified D1 export/restore, R2 inventory/hashes, Qdrant snapshot while applicable, configuration inventory without secret values, and rollback evidence.
- Migration proceeds through dedicated legal D1, complete legal R2 evidence export, metadata/relationship transformation, private Worker deployment, shadow Adapters, current activation, history/comparison activation, production canary, stability windows, restore rehearsal, legacy-write stop, forward schema removal, and Qdrant retirement.

## Testing Decisions

- Good tests assert externally observable legal-retrieval, evidence-integrity, release-lifecycle, and migration outcomes. They do not assert private helper structure, SQL statement ordering, provider SDK calls, or internal batch sizes unless those values are part of the accepted Interface.
- The primary test seam is an authenticated Legal Answer retrieval request using the existing private legal-corpus service-binding Adapter. These tests observe Temporal Scope routing, Source Ladder escalation, Source Unavailability, Provision Sets, Controlling Text resolution, Official Citations, Conditional Answers, and Insufficient-Evidence Results.
- Candidate Adapter contract tests run the same behavior suite against Qdrant/D1, AI Search, and in-memory Adapters. They verify endpoint/release pinning, all-shard participation, deterministic wave fusion, result limits, partial-error invalidation, and provider-neutral Candidate Packets.
- OfficialEvidenceResolver tests use local D1 and in-memory R2 Adapters through the resolver Interface. They verify release membership, Official Eligibility, applicability, authority, metadata parity, byte/hash/source-hash checks, provision ceilings, and fail-closed behavior.
- Release-lifecycle tests use isolated local D1 and in-memory provider/R2 Adapters through the lifecycle Interface. They verify immutable snapshots/releases, compatible capability membership, gate completeness, atomic activation, rollback, cost controls, and persisted soak clocks.
- Migration tests compare source and target inventories through the migration-verification seam. They cover idempotent restart, same-day Lex revisions, unknown authority/applicability, lineage splits/merges, missing/extra objects, count/hash mismatch, and no body columns in final legal D1.
- Privacy tests assert the actual provider-bound request and telemetry output, including direct identifiers, secrets, payment data, multilingual names/addresses, and legally material facts that must remain. They never test only the transform's internal token rules.
- R2 evidence tests assert immutable-write behavior, deterministic serialization, duplicate-identical writes, overwrite rejection, partial failure, locator creation after verification, and retention-policy attestation.
- Configuration tests assert that the legal-corpus Worker has no public route, environment resources are distinct, Gateway logging/caches are disabled, provider configuration is pinned, and cross-environment/unpinned requests fail closed.
- Evaluation tests exercise exact citation, Russian, Uzbek Latin, Uzbek Cyrillic, English, cross-language recovery, ambiguity, broad legal domains, current/as-of/all comparison forms, long/adjacent/referenced provisions, typo/transliteration, adversarial source text, cold/warm, fast/deep, and dependency-failure strata.
- Backup and rollout tests restore D1 in isolation, verify R2 inventories and Qdrant snapshots, rehearse Activation Set rollback, and prove legacy retirement remains blocked until real persisted 30-day and 90-day evidence exists.
- Prior art is the repository's existing legal-corpus Worker-boundary, private read-service, legal research-loop, chat-retrieval, versioning/ingestion, search-manifest, release-gate, Qdrant snapshot/reconciliation, and D1 export/restore test suites. New tests should extend those observable seams rather than duplicate their internal assertions.

## Out of Scope

- AI Search generation, query rewriting, provider reranking, and provider-authored Legal Answers.
- Direct Vectorize as the sole official-corpus candidate index, because it does not satisfy the mandatory sparse channel.
- Moving private user documents, internal materials, tenant data, workspace data, or owner materials into the official-corpus storage or retrieval path.
- Treating a translation, transliteration, language route, provider ID, article number, or model inference as authority, stable identity, or legal applicability evidence.
- Per-document human legal approval as a requirement for Official Eligibility; eligibility remains automated and evidence-backed.
- Bypassing quality, privacy, cost, backup, soak, canary, stability, or restore gates to accelerate rollout.
- Deleting immutable R2 evidence or manifests required to reproduce a Citation.
- Removing legacy Qdrant or platform-D1 rollback machinery before its accepted retirement gate.

## Further Notes

- Implementation is divided into twenty-one numbered tracer-bullet tickets in this feature's `issues` directory. Ticket dependencies define the execution frontier; calendar-gated rollout tickets remain open until actual evidence exists.
- The pre-implementation recovery bundle created on 2026-08-30 is restore-tested and records the original dirty worktree, durable overlay, repository bundle, and complete corpus archive. The implementation session must refresh or supplement recovery evidence for spec changes and repeat service backups before every remote mutation.
- The current staging corpus observations are approximately 151,499 current chunks and 1.30 million historical/current chunks. The accepted initial partition is one current hybrid instance and four deterministic history shards, subject to manifest counts at build time.
- AI Search is currently a beta dependency. The Adapter seam, rollback path, integrity rules, and Source Ladder behavior remain mandatory even if the provider implementation changes later.
- Current production corpus features remain disabled until the target capability's actual gate evidence exists. Authorization to provision, migrate, activate, and retire resources does not authorize bypassing any accepted gate.
