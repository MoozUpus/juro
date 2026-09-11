-- A prior retirement migration removed the immutable article/chunk and hybrid
-- sparse storage while documents, variants and versions remained live. This is
-- deliberately additive: it never deletes or rewrites those existing rows.
CREATE TABLE IF NOT EXISTS `legal_corpus_provisions` (
  `id` text PRIMARY KEY NOT NULL,
  `document_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `version_id` text NOT NULL,
  `article_number` text,
  `article_number_normalized` text,
  `article_title` text,
  `part` text,
  `chapter` text,
  `section` text,
  `sequence` integer NOT NULL,
  `text` text NOT NULL,
  `exact_quote_source` text NOT NULL,
  `language` text NOT NULL,
  `status` text NOT NULL,
  `valid_from` text,
  `valid_to` text,
  `source_url` text,
  `content_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`sequence`>=0),
  CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CHECK (`status` IN ('active','repealed','historical','unknown')),
  CHECK (`valid_to` IS NULL OR `valid_from` IS NULL OR `valid_to`>`valid_from`),
  CHECK (length(trim(`text`))>0 AND length(trim(`exact_quote_source`))>0),
  CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*'),
  CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `legal_corpus_provisions_version_ref_uidx`
  ON `legal_corpus_provisions` (`version_id`,`article_number_normalized`,`sequence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legal_corpus_provisions_lookup_idx`
  ON `legal_corpus_provisions` (`document_id`,`article_number_normalized`,`status`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `legal_corpus_chunks` (
  `id` text PRIMARY KEY NOT NULL,
  `provision_id` text NOT NULL,
  `version_id` text NOT NULL,
  `chunk_index` integer NOT NULL,
  `total_chunks` integer NOT NULL,
  `content_text` text NOT NULL,
  `content_sha256` text NOT NULL,
  `dense_vector_id` text,
  `sparse_terms_json` text NOT NULL DEFAULT '[]',
  `indexed_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`provision_id`) REFERENCES `legal_corpus_provisions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`chunk_index`>=0 AND `total_chunks`>=1 AND `chunk_index`<`total_chunks`),
  CHECK (length(trim(`content_text`))>0),
  CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `legal_corpus_chunks_provision_order_uidx`
  ON `legal_corpus_chunks` (`provision_id`,`chunk_index`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `legal_corpus_chunks_vector_uidx`
  ON `legal_corpus_chunks` (`dense_vector_id`) WHERE `dense_vector_id` IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `legal_corpus_sparse_terms` (
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
  CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CHECK (`term_frequency`>=0 AND `title_frequency`>=0 AND `article_frequency`>=0),
  CHECK (`term_frequency`+`title_frequency`+`article_frequency`>0),
  CHECK (length(`term`) BETWEEN 1 AND 81)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legal_corpus_sparse_chunk_idx` ON `legal_corpus_sparse_terms` (`chunk_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legal_corpus_sparse_version_idx`
  ON `legal_corpus_sparse_terms` (`version_id`,`language`,`document_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `legal_corpus_sparse_term_dictionary` (
  `id` integer PRIMARY KEY NOT NULL,
  `term` text NOT NULL,
  CHECK (length(`term`) BETWEEN 1 AND 81),
  UNIQUE (`term`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `legal_corpus_sparse_chunk_keys` (
  `id` integer PRIMARY KEY NOT NULL,
  `chunk_id` text NOT NULL,
  FOREIGN KEY (`chunk_id`) REFERENCES `legal_corpus_chunks`(`id`) ON UPDATE no action ON DELETE restrict,
  UNIQUE (`chunk_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `legal_corpus_sparse_postings` (
  `term_id` integer NOT NULL,
  `chunk_key_id` integer NOT NULL,
  `term_frequency` integer NOT NULL,
  `title_frequency` integer NOT NULL DEFAULT 0,
  `article_frequency` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`term_id`,`chunk_key_id`),
  FOREIGN KEY (`term_id`) REFERENCES `legal_corpus_sparse_term_dictionary`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`chunk_key_id`) REFERENCES `legal_corpus_sparse_chunk_keys`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`term_frequency`>=0 AND `title_frequency`>=0 AND `article_frequency`>=0),
  CHECK (`term_frequency`+`title_frequency`+`article_frequency`>0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `legal_corpus_sparse_postings_chunk_key_idx`
  ON `legal_corpus_sparse_postings` (`chunk_key_id`);
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS `legal_corpus_provisions_immutable_guard`
  BEFORE UPDATE ON `legal_corpus_provisions`
  FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `legal_corpus_provisions_no_delete`
  BEFORE DELETE ON `legal_corpus_provisions`
  FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_DELETE_FORBIDDEN'); END;
