-- D1 full exports reject databases that contain FTS5 virtual tables. Keep the
-- immutable legal text in normal tables and use an exportable inverted index
-- so backup/restore remains a hard release gate.
DROP TABLE IF EXISTS `legal_corpus_search`;
--> statement-breakpoint
CREATE TABLE `legal_corpus_sparse_terms` (
  `term` text NOT NULL,
  `chunk_id` text NOT NULL,
  `document_id` text NOT NULL,
  `version_id` text NOT NULL,
  `language` text NOT NULL,
  `term_frequency` integer NOT NULL,
  `title_frequency` integer NOT NULL DEFAULT 0,
  `article_frequency` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`term`,`chunk_id`),
  FOREIGN KEY (`chunk_id`) REFERENCES `legal_corpus_chunks`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_sparse_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_sparse_frequency_check` CHECK (`term_frequency`>=0 AND `title_frequency`>=0 AND `article_frequency`>=0),
  CONSTRAINT `legal_corpus_sparse_nonempty_check` CHECK (`term_frequency`+`title_frequency`+`article_frequency`>0),
  CONSTRAINT `legal_corpus_sparse_term_check` CHECK (length(`term`) BETWEEN 1 AND 81)
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_sparse_chunk_idx` ON `legal_corpus_sparse_terms` (`chunk_id`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_sparse_version_idx` ON `legal_corpus_sparse_terms` (`version_id`,`language`,`document_id`);
