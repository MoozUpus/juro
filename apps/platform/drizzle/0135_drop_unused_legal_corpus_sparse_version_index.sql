-- Sparse retrieval uses the (term, chunk_id) primary key and bounded Qdrant
-- export/maintenance uses legal_corpus_sparse_chunk_idx. No runtime query
-- filters this high-cardinality table by (version_id, language, document_id),
-- so retaining that duplicate secondary index consumes D1 capacity and adds
-- write amplification throughout the bounded corpus crawl.
DROP INDEX IF EXISTS `legal_corpus_sparse_version_idx`;
