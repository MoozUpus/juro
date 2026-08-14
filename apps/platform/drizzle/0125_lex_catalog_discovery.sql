-- Resumable Lex.uz catalog traversal. Checkpoints store only public catalog
-- metadata and ASP.NET postback state; no legal text or user data is stored.
CREATE TABLE `legal_corpus_source_aliases` (
  `source_url` text PRIMARY KEY NOT NULL,
  `document_id` text NOT NULL,
  `provider_source_id` text NOT NULL,
  `language` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_alias_provider_id_check` CHECK (length(`provider_source_id`) BETWEEN 1 AND 180),
  CONSTRAINT `legal_corpus_alias_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_alias_url_check` CHECK (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%')
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_source_alias_document_idx` ON `legal_corpus_source_aliases` (`document_id`,`language`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_discovery_checkpoints` (
  `id` text PRIMARY KEY NOT NULL,
  `category_key` text NOT NULL,
  `language` text NOT NULL,
  `search_url` text NOT NULL,
  `status` text NOT NULL DEFAULT 'queued',
  `page_number` integer NOT NULL DEFAULT 0,
  `expected_document_count` integer,
  `discovered_document_count` integer NOT NULL DEFAULT 0,
  `next_event_target` text,
  `view_state` text,
  `view_state_generator` text,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `next_attempt_at` text,
  `last_error_code` text,
  `started_at` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_corpus_discovery_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_discovery_status_check` CHECK (`status` IN ('queued','running','retrying','completed','failed','dead_letter')),
  CONSTRAINT `legal_corpus_discovery_page_check` CHECK (`page_number`>=0 AND `discovered_document_count`>=0),
  CONSTRAINT `legal_corpus_discovery_expected_check` CHECK (`expected_document_count` IS NULL OR `expected_document_count`>=0),
  CONSTRAINT `legal_corpus_discovery_attempt_check` CHECK (`attempt_count` BETWEEN 0 AND 12),
  CONSTRAINT `legal_corpus_discovery_url_check` CHECK (length(`search_url`) BETWEEN 12 AND 2048 AND `search_url` LIKE 'https://lex.uz/%')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_discovery_category_language_uidx` ON `legal_corpus_discovery_checkpoints` (`category_key`,`language`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_discovery_ready_idx` ON `legal_corpus_discovery_checkpoints` (`status`,`next_attempt_at`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_discovery_documents` (
  `checkpoint_id` text NOT NULL,
  `source_url` text NOT NULL,
  `provider_source_id` text NOT NULL,
  `language` text NOT NULL,
  `discovered_at` text NOT NULL,
  PRIMARY KEY (`checkpoint_id`,`source_url`),
  FOREIGN KEY (`checkpoint_id`) REFERENCES `legal_corpus_discovery_checkpoints`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_discovery_document_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_discovery_document_url_check` CHECK (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%')
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_discovery_documents_source_idx` ON `legal_corpus_discovery_documents` (`provider_source_id`,`language`);
