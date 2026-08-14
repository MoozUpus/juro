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
