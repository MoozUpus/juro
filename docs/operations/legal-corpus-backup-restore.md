# Legal corpus backup, restore and rollback

The maintained procedures are:

- [backup](./legal-corpus-backup.md);
- [restore rehearsal](./legal-corpus-restore.md);
- [rollback](./legal-corpus-rollback.md); and
- [bounded verification policy](./legal-corpus-verification.md).

The live architecture is R2-native: immutable Evidence R2 and derivative-index R2 hold legal evidence, Retrieval Chunks, BM25 artifacts and reusable embeddings; Vectorize serves the dense lane; D1 holds body-free control data and atomic Activation Sets.

The former official-body/posting D1 schemas, Qdrant Container, AI Search instances and scheduled acquisition path were retired. Their accepted archive is for isolated historical recovery only. It must not be rebuilt, reattached or treated as a rollback target. Do not regenerate embeddings, alter legal text or repeat completed corpus audits.
