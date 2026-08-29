# Escalate legal research through a strict source ladder

JURO legal research searches the Indexed Official Corpus first, performs Live Official Search only when indexed coverage is insufficient, and begins Secondary Web Research only when official coverage remains insufficient. This deliberately accepts additional latency in exchange for source-priority integrity, avoids unnecessary third-party requests, and keeps secondary material from influencing an answer when official law is sufficient.

## Consequences

Retrieval tiers must not run speculatively in parallel. The interface should expose concise, honest progress states so the longer sequential path remains understandable without presenting unvalidated content as an answer. Strong explicit act/article matches are selected deterministically, including provisions split across multiple chunks; the model reranker is reserved for competing or ambiguous candidates.
