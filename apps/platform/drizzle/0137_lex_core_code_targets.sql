-- Exact core-code targets are operational metadata, not legal text. Persisting
-- the strict title-search result keeps code-first ingestion resumable when
-- Lex reader metadata uses a different official language for the title.
CREATE TABLE `legal_corpus_core_code_targets` (
  `target_id` text PRIMARY KEY NOT NULL,
  `title_ru` text NOT NULL,
  `status` text NOT NULL DEFAULT 'queued',
  `source_url` text,
  `canonical_document_id` text,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `next_attempt_at` text,
  `last_error_code` text,
  `resolved_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_corpus_core_code_target_id_check` CHECK (length(`target_id`) BETWEEN 2 AND 120),
  CONSTRAINT `legal_corpus_core_code_title_check` CHECK (length(trim(`title_ru`)) BETWEEN 3 AND 500),
  CONSTRAINT `legal_corpus_core_code_status_check` CHECK (`status` IN ('queued','retrying','awaiting_ingestion','indexed','technically_unavailable')),
  CONSTRAINT `legal_corpus_core_code_attempt_check` CHECK (`attempt_count` BETWEEN 0 AND 12),
  CONSTRAINT `legal_corpus_core_code_url_check` CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://lex.uz/%')),
  CONSTRAINT `legal_corpus_core_code_canonical_id_check` CHECK (`canonical_document_id` IS NULL OR (length(`canonical_document_id`) BETWEEN 7 AND 180 AND `canonical_document_id` GLOB 'lexuz:*'))
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_core_code_target_ready_idx`
  ON `legal_corpus_core_code_targets` (`status`,`next_attempt_at`,`updated_at`);
