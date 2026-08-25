# Legal corpus state

## Production on 2026-08-25

Production answers use direct, query-scoped retrieval from official Lex.uz.
Lex ingestion and metadata monitoring are enabled, but the local indexed corpus,
automatic corpus ingestion, multilingual corpus, dense/vector retrieval, and
corpus shadow mode are disabled.

This distinction is intentional. Direct retrieval can provide a bounded,
current official source packet without claiming that JURO has completed or
released a full national legal corpus.

## Indexed-corpus release boundary

The full-corpus path remains staging work. It cannot be enabled in production
until the dedicated release artifact proves all required document/provision/chunk
counts, 44/44 checkpoints, a frozen and empty ingestion queue, zero failures and
dead letters, fresh source health, snapshot/restore integrity, exact Qdrant
topology, the 314-scenario benchmark, pricing, and named legal review.

Counts alone do not prove completion. No production claim should imply corpus
coverage, recall, or vector quality while this gate remains open.

Private owner documents are stored and retrieved under tenant authorization.
They remain separate from the global legal corpus and never become official
citations through upload or similarity.
