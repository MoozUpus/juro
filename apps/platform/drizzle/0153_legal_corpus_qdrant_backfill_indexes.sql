-- Bound the resumable dense backfill to unindexed chunks and eliminate the
-- correlated NPA-version scan for every candidate chunk. These are additive
-- indexes only: no normative text, temporal metadata, or existing vectors is
-- modified by this migration.
CREATE INDEX `legal_corpus_chunks_dense_backfill_idx`
  ON `legal_corpus_chunks` (`version_id`,`created_at`,`id`)
  WHERE `dense_vector_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `npa_document_versions_corpus_version_idx`
  ON `npa_document_versions` (`legal_corpus_version_id`);
