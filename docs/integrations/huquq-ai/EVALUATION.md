# Evaluation

JURO stores only lawyer-reviewed ground truth. The protected staging run
`staging-20260814-canonical` has 314/314 immutable per-scenario records linked
to the fresh-MFA `confirmed_correct` legal-review attestation described in
`STAGING_RELEASE_EVIDENCE_2026-08-14.md`. New or changed cases remain
`LEGAL_REVIEW_REQUIRED` until they pass that same human workflow. The attestation
does not retroactively turn unit fixtures into ground truth and does not publish
an indexed-corpus recall, groundedness or latency achievement.

Required suites are RU, Uzbek Latin, Uzbek Cyrillic, mixed-language, hard, versioning,
citation and security cases. Measure recall@5/@10, MRR, citation precision/recall,
article/document exactness, abstention and partial-answer accuracy, stale-source and
invalid-link rates, groundedness, latency and cost. Include non-existent articles,
historical dates, prompt injection, unavailable source/provider, cancellation and
cross-tenant document attempts.

## Indexed-corpus release gate

The indexed corpus has a separate fail-closed verifier:

```text
npm run build:legal-corpus:release-evidence -- \
  --dashboard <frozen-dashboard.json> \
  --benchmark <indexed-314-benchmark.json> \
  --human-review <mfa-human-review-evidence.json> \
  --application-commit <40-char-sha> \
  --corpus-snapshot-sha256 <64-char-sha256> \
  --output <release-evidence.json>
npm run evaluate:legal:corpus-release -- --evidence <release-evidence.json>
```

The builder parses the strict dashboard and benchmark schemas, verifies the
314-record human export digest, canonical evaluation-corpus hash and complete
MFA-bound event-hash chain, and binds the attestation, scope, export and file
digests into the release envelope. A literal `reviewedScenarioCount: 314`
without that cryptographic binding is not accepted as release evidence.

The version 3 evidence envelope is bound to an application commit and corpus
snapshot SHA-256. It requires all 44 category/language checkpoints, a frozen
ingestion queue, fresh Lex health, intact admin audit history, dense+sparse RRF
with the declared 1,536-dimensional Qdrant schema, and exactly 314 individually
reviewed scenarios. The benchmark must report current and total Qdrant point
counts plus the restored snapshot's current and total counts. Current points
must equal the frozen corpus's current chunk count, total points cannot be lower,
and both restored counts must match the source collection. A separate SHA-256 is
required for the Qdrant snapshot artifact. The gate also enforces recall,
exactness, abstention, partial-answer, groundedness, latency, pricing and
invalid/stale-source thresholds.

Corpus size is fail-closed as well: the evidence must contain at least 1,283
canonical documents, 20,296 unique provisions and 22,513 indexed chunks. These
values are pinned to the audited Huquq AI commit and the owner's reserve floor;
language completeness is not inferred from multiplication and is instead
proved by the 44 independent checkpoints.

These values are release policy thresholds, not reported product achievements.
The completed 314-scenario direct-source review is necessary evidence, but it
does not pass this separate indexed-corpus gate: the staging corpus is still
growing, the frozen snapshot benchmark has not run, and dense Qdrant retrieval
remains disabled.

The independent Qdrant engine gate passed again on the private-staging-service
head in GitHub Actions run
[31893157240](https://github.com/MoozUpus/juro/actions/runs/31893157240).
It used the real Qdrant 1.18.2 REST API with 1,536-dimensional named dense and
sparse vectors, verified dense/sparse/hybrid ordering, downloaded a collection
snapshot (118,784 bytes, SHA-256
`8c0a7eb8b172e11f904b13ac96505d304049e8b366fc0b7f0a9a6bfc323d430d`),
restored it by upload and repeated the query. Artifact
`qdrant-snapshot-gate-31893157240` has GitHub artifact ID `9249080373`.
That three-point infrastructure fixture is deliberately not counted as the
314-scenario legal relevance benchmark.

The command must fail while the corpus is empty, flags are disabled, evidence is
stale, the benchmark uses another snapshot, a provider request is unpriced or a
metric is absent. A passing JSON report may be recorded only after the real
staging run; unit-test fixtures are not release evidence.
