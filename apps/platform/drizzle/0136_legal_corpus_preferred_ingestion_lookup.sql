-- Supports the bounded preferred-catalogue share without scanning the full
-- ingestion backlog. It changes no corpus content or job state.
CREATE INDEX `legal_corpus_ingestion_document_language_ready_idx`
  ON `legal_corpus_ingestion_jobs` (`canonical_document_id`,`language`,`status`,`next_attempt_at`,`created_at`);
