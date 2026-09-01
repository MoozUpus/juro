# JURO local legal corpus

Status: **EXCLUDED from the active execution scope; not completed by v113**

Evidence cutoff: **2026-09-01**

The owner instructed the agent to skip legislation-database and legal-corpus work and proceed to the next goal step. v113 therefore performs no corpus ingestion, D1 corpus mutation, vector indexing, embeddings, Qdrant operation, snapshot/restore, queue manipulation, capacity remediation, or completion verification.

Checked-in production configuration keeps `LEGAL_CORPUS_ENABLED`, live-corpus Lex retrieval, automatic ingestion, multilingual corpus, historical corpus, dense retrieval, and corpus shadow mode set to `false`. Staging contains historical corpus configuration and evidence, but v113 does not refresh, modify, or count it as complete.

The interactive product may still retrieve direct official Lex.uz material under the separate direct-source contract described in [`lexuz-provider.md`](./lexuz-provider.md). That is not a local corpus implementation.

This document satisfies the required canonical path only. Its status must remain `EXCLUDED`, never `VERIFIED` or `COMPLETE`, unless the owner changes the scope and the independent release gates pass.
