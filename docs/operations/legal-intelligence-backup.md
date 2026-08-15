# Legal-intelligence backup

Back up the official-corpus Qdrant collection snapshot plus its SHA-256, engine
version and collection name; the private-document Vectorize index identifier;
D1 source registry/version/lifecycle tables; update queue state; and R2
manifests. Exclude secrets and user documents unless a separate retention
policy authorizes them. Capture index/version identifiers atomically and retain
the source hash ledger needed to verify a restore.

Before a corpus update: snapshot → fetch → diff → validate → reindex changed chunks only
→ report. Stop on suspicious mass change. Restore must be rehearsed in an isolated
environment, use Qdrant snapshot priority `snapshot`, verify dense/sparse/hybrid
queries, and verify one active and one historical article before any production
approval.
