# Evaluation

JURO must store only lawyer-reviewed ground truth. Until review is complete, every case
is `LEGAL_REVIEW_REQUIRED`; no recall, groundedness or latency result is a published
achievement.

Required suites are RU, Uzbek Latin, Uzbek Cyrillic, mixed-language, hard, versioning,
citation and security cases. Measure recall@5/@10, MRR, citation precision/recall,
article/document exactness, abstention and partial-answer accuracy, stale-source and
invalid-link rates, groundedness, latency and cost. Include non-existent articles,
historical dates, prompt injection, unavailable source/provider, cancellation and
cross-tenant document attempts.

## Indexed-corpus release gate

The indexed corpus has a separate fail-closed verifier:

```text
npm run evaluate:legal:corpus-release -- --evidence <release-evidence.json>
```

The evidence envelope is bound to an application commit and corpus snapshot
SHA-256. It requires all 44 category/language checkpoints, a frozen ingestion
queue, fresh Lex health, intact admin audit history, dense+sparse RRF with the
declared 1,536-dimensional Qdrant schema, and exactly 314 individually reviewed
scenarios. It also enforces recall, exactness, abstention, partial-answer,
groundedness, latency, pricing and invalid/stale-source thresholds.

These values are release policy thresholds, not reported product achievements.
The command must fail while the corpus is empty, flags are disabled, evidence is
stale, the benchmark uses another snapshot, a provider request is unpriced or a
metric is absent. A passing JSON report may be recorded only after the real
staging run; unit-test fixtures are not release evidence.
