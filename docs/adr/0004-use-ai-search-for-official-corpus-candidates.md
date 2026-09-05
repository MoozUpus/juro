# Use AI Search for official-corpus candidate retrieval

The source/eligibility portions of this decision are superseded by
[ADR 0005](./0005-use-source-snapshot-retrieval-eligibility.md). AI Search,
release isolation, failure and activation decisions remain in force. Legacy
authority and language-relationship records remain preserved audit evidence;
they are not current Retrieval Eligibility gates.

Status: superseded by [ADR 0006](./0006-own-hybrid-official-corpus-retrieval.md) for candidate-index implementation; its evidence-safety, privacy, release-isolation and rollback constraints remain historical inputs to the replacement.

JURO will keep every immutable official-corpus body in a dedicated R2 bucket and relational identity, authority, temporal applicability, lineage, release manifests, and activation state in a dedicated legal-corpus D1 database. Versioned Cloudflare AI Search hybrid instances will provide sparse and dense candidates for the Indexed Official Corpus through a private JURO-owned `LegalCandidateIndex` Interface. JURO will use only search results: Question Interpretation, D1 eligibility revalidation, R2 hash-verified hydration, provision grouping, coverage mapping, semantic reranking, the Source Ladder, Citations, and Legal Answer generation remain JURO responsibilities.

## Consequences

Current-law, point-in-time, and comparative questions use capability-scoped, manifest-selected corpus slices so superseded law is not silently mixed with current law. Current search may activate before historical search; an unsupported Temporal Scope continues to Live Official Search. Before indexed comparisons activate, their current and historical Search Releases must come from the same Corpus Snapshot and be selected together by one atomic Activation Set.

A Search Release is built off-side from one deterministic R2 object per JURO chunk, sharded below AI Search limits, and activated only after every shard, language lane, metadata row, object hash, retrieval-quality, failure, latency, privacy, and cost gate passes. Any missing required shard, partial namespace response, unknown key, wrong-release key, configuration drift, or R2 hash mismatch invalidates the whole indexed packet and becomes Source Unavailability.

The certified or adopted state-language expression is the Controlling Text. Other-language expressions remain explicitly ranked and linked translations; language-family membership never implies equal legal authority. Editorial Text Revisions and sourced legal Applicability Periods are modeled independently, with provision lineage supporting renumbering, movement, split, merge, amendment, and repeal.

AI Search and its embedding provider receive only public release artifacts and query formulations after JURO's deterministic provider-boundary privacy transform. Dedicated environment-specific gateways and provider projects have payload logging, Gateway caching, and AI Search similarity caching disabled. Production query embeddings require the accepted provider privacy controls and spend gates.

This ADR historically rejected Vectorize as the sole official-corpus index because it lacked the mandatory BM25 channel. ADR 0006 instead pairs Vectorize with application-owned R2 BM25, so that rejection no longer applies to the complete custom pair. Its original 90-day stability and repeated restore gates are superseded by the [verification policy](../operations/legal-corpus-verification.md). Qdrant/D1 retention now follows exact unused-resource and recovery-coverage checks after custom activation; the incomplete AI Search experiment remains historical evidence until retirement.
