-- The statutory corpus is a bounded, auditable layer over the existing
-- legal_corpus_* storage. Target declarations are deliberately distinct from
-- verified LexUZ metadata: no user-facing retrieval can use a target until a
-- canonical LexUZ card, source checksum and applicable version are recorded.
CREATE TABLE `npa_master_targets` (
  `document_key` text PRIMARY KEY NOT NULL,
  `target_set` text NOT NULL,
  `priority` text NOT NULL DEFAULT 'P0',
  `expected_title_ru` text NOT NULL,
  `expected_title_aliases_json` text NOT NULL DEFAULT '[]',
  `expected_act_type` text NOT NULL,
  `expected_act_number` text,
  `expected_adoption_date` text NOT NULL,
  `source_seed_url` text,
  `successor_document_key` text,
  `replaces_document_key` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`target_set` IN ('mandatory','future')),
  CHECK (`priority`='P0'),
  CHECK (`expected_act_type` IN ('constitution','code','law')),
  CHECK (length(`document_key`) BETWEEN 3 AND 120),
  CHECK (length(trim(`expected_title_ru`)) BETWEEN 3 AND 700),
  CHECK (`expected_act_number` IS NULL OR length(trim(`expected_act_number`)) BETWEEN 2 AND 80),
  CHECK (`expected_adoption_date` GLOB '????-??-??'),
  CHECK (`source_seed_url` IS NULL OR `source_seed_url` GLOB 'https://lex.uz/*')
);
--> statement-breakpoint
CREATE INDEX `npa_master_targets_set_idx`
  ON `npa_master_targets` (`target_set`,`document_key`);
--> statement-breakpoint

-- This state machine contains discovery evidence and pager state, not legal
-- content. It makes the bounded 100-act resolution resumable and prevents a
-- title-search hit from silently becoming a production source.
CREATE TABLE `npa_discovery_state` (
  `document_key` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL DEFAULT 'queued',
  `candidate_source_url` text,
  `candidate_lexuz_doc_id` text,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `next_attempt_at` text,
  `last_error_code` text,
  `page_number` integer NOT NULL DEFAULT 0,
  `next_event_target` text,
  `view_state` text,
  `view_state_generator` text,
  `source_session_cookie` text,
  `source_session_expires_at` text,
  `last_checked_at` text,
  `resolved_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`document_key`) REFERENCES `npa_master_targets`(`document_key`) ON UPDATE no action ON DELETE restrict,
  CHECK (`status` IN ('queued','retrying','candidate','verified','future','repealed','manual_review')),
  CHECK (`candidate_source_url` IS NULL OR `candidate_source_url` GLOB 'https://lex.uz/*'),
  CHECK (`candidate_lexuz_doc_id` IS NULL OR length(`candidate_lexuz_doc_id`) BETWEEN 1 AND 80),
  CHECK (`attempt_count` BETWEEN 0 AND 24),
  CHECK (`page_number` BETWEEN 0 AND 12)
);
--> statement-breakpoint
CREATE INDEX `npa_discovery_state_ready_idx`
  ON `npa_discovery_state` (`status`,`next_attempt_at`,`updated_at`);
--> statement-breakpoint

CREATE TABLE `npa_master_registry` (
  `document_key` text PRIMARY KEY NOT NULL,
  `lexuz_doc_id` text NOT NULL,
  `legal_corpus_document_id` text NOT NULL,
  `title_ru` text,
  `title_uz` text,
  `short_title` text NOT NULL,
  `act_type` text NOT NULL,
  `act_number` text,
  `adoption_date` text,
  `publication_date` text,
  `effective_from` text,
  `effective_to` text,
  `status` text NOT NULL,
  `future_status` text,
  `successor_document_key` text,
  `replaces_document_key` text,
  `source` text NOT NULL DEFAULT 'LexUZ',
  `source_reference` text NOT NULL,
  `content_checksum` text NOT NULL,
  `last_checked_at` text NOT NULL,
  `article_count` integer NOT NULL DEFAULT 0,
  `chunk_count` integer NOT NULL DEFAULT 0,
  `rag_enabled` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`document_key`) REFERENCES `npa_master_targets`(`document_key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`legal_corpus_document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`status` IN ('active','future','repealed','partially_effective','transitional','manual_review')),
  CHECK (`future_status` IS NULL OR `future_status` IN ('scheduled_activation','scheduled_repeal','scheduled_replacement')),
  CHECK (`source`='LexUZ'),
  CHECK (`source_reference` GLOB 'https://lex.uz/*'),
  CHECK (length(`lexuz_doc_id`) BETWEEN 1 AND 80),
  CHECK (length(`content_checksum`)=64 AND `content_checksum` NOT GLOB '*[^0-9a-f]*'),
  CHECK (`article_count`>=0 AND `chunk_count`>=0),
  CHECK (`rag_enabled` IN (0,1)),
  CHECK (`effective_to` IS NULL OR `effective_from` IS NULL OR `effective_to`>=`effective_from`),
  CHECK ((`status`='active' AND `rag_enabled`=1) OR `rag_enabled`=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `npa_master_registry_lexuz_uidx`
  ON `npa_master_registry` (`lexuz_doc_id`);
--> statement-breakpoint
CREATE INDEX `npa_master_registry_retrieval_idx`
  ON `npa_master_registry` (`status`,`rag_enabled`,`effective_from`,`effective_to`);
--> statement-breakpoint

CREATE TABLE `npa_document_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `document_key` text NOT NULL,
  `language` text NOT NULL,
  `legal_corpus_variant_id` text NOT NULL,
  `legal_corpus_version_id` text NOT NULL,
  `version_effective_from` text NOT NULL,
  `version_effective_to` text,
  `version_as_of` text NOT NULL,
  `status` text NOT NULL,
  `normative_checksum` text NOT NULL,
  `editorial_metadata_object_key` text,
  `amendment_history_object_key` text,
  `source_metadata_object_key` text,
  `last_checked_at` text NOT NULL,
  `rag_enabled` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  FOREIGN KEY (`document_key`) REFERENCES `npa_master_registry`(`document_key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`legal_corpus_variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`legal_corpus_version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru')),
  CHECK (`status` IN ('active','future','repealed','partially_effective','transitional','manual_review')),
  CHECK (`version_effective_to` IS NULL OR `version_effective_to`>=`version_effective_from`),
  CHECK (length(`normative_checksum`)=64 AND `normative_checksum` NOT GLOB '*[^0-9a-f]*'),
  CHECK (`rag_enabled` IN (0,1)),
  CHECK ((`status`='active' AND `rag_enabled`=1) OR `rag_enabled`=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `npa_document_versions_identity_uidx`
  ON `npa_document_versions` (`document_key`,`language`,`version_effective_from`,`normative_checksum`);
--> statement-breakpoint
CREATE INDEX `npa_document_versions_temporal_idx`
  ON `npa_document_versions` (`document_key`,`language`,`status`,`version_effective_from`,`version_effective_to`);
--> statement-breakpoint

CREATE TABLE `npa_chunk_metadata` (
  `chunk_id` text PRIMARY KEY NOT NULL,
  `npa_document_version_id` text NOT NULL,
  `structural_path` text NOT NULL,
  `parent_context` text NOT NULL,
  `article` text,
  `part` text,
  `chapter` text,
  `section` text,
  `content_checksum` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`chunk_id`) REFERENCES `legal_corpus_chunks`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`npa_document_version_id`) REFERENCES `npa_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (length(trim(`structural_path`)) BETWEEN 3 AND 2000),
  CHECK (length(trim(`parent_context`)) BETWEEN 3 AND 3000),
  CHECK (length(`content_checksum`)=64 AND `content_checksum` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `npa_chunk_metadata_dedupe_uidx`
  ON `npa_chunk_metadata` (`npa_document_version_id`,`structural_path`,`content_checksum`);
--> statement-breakpoint
CREATE INDEX `npa_chunk_metadata_article_idx`
  ON `npa_chunk_metadata` (`npa_document_version_id`,`article`);
--> statement-breakpoint

CREATE TABLE `npa_language_records` (
  `document_key` text NOT NULL,
  `language` text NOT NULL,
  `source_reference` text NOT NULL,
  `language_status` text NOT NULL,
  `last_checked_at` text NOT NULL,
  PRIMARY KEY (`document_key`,`language`),
  FOREIGN KEY (`document_key`) REFERENCES `npa_master_registry`(`document_key`) ON UPDATE no action ON DELETE restrict,
  CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru')),
  CHECK (`language_status` IN ('official_source_text','source_language_unavailable','source_label_unverified')),
  CHECK (`source_reference` GLOB 'https://lex.uz/*')
);
--> statement-breakpoint

CREATE TABLE `npa_cross_references` (
  `id` text PRIMARY KEY NOT NULL,
  `source_document_key` text NOT NULL,
  `source_version_id` text NOT NULL,
  `source_provision_id` text NOT NULL,
  `source_article` text,
  `relation_type` text NOT NULL,
  `target_document_key` text,
  `target_article` text,
  `raw_reference` text NOT NULL,
  `resolution_status` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`source_document_key`) REFERENCES `npa_master_registry`(`document_key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_version_id`) REFERENCES `npa_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_provision_id`) REFERENCES `legal_corpus_provisions`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`relation_type` IN ('refers_to','implemented_by','amends','repeals')),
  CHECK (`resolution_status` IN ('resolved','unresolved','ambiguous')),
  CHECK (length(trim(`raw_reference`)) BETWEEN 2 AND 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `npa_cross_reference_dedupe_uidx`
  ON `npa_cross_references` (`source_version_id`,`source_provision_id`,`raw_reference`);
--> statement-breakpoint
CREATE INDEX `npa_cross_reference_target_idx`
  ON `npa_cross_references` (`target_document_key`,`target_article`);
--> statement-breakpoint

CREATE TABLE `npa_ingestion_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `as_of_date` text NOT NULL,
  `run_kind` text NOT NULL,
  `status` text NOT NULL,
  `target_count` integer NOT NULL DEFAULT 100,
  `located_count` integer NOT NULL DEFAULT 0,
  `verified_count` integer NOT NULL DEFAULT 0,
  `active_count` integer NOT NULL DEFAULT 0,
  `future_count` integer NOT NULL DEFAULT 0,
  `manual_review_count` integer NOT NULL DEFAULT 0,
  `documents_ingested` integer NOT NULL DEFAULT 0,
  `articles_ingested` integer NOT NULL DEFAULT 0,
  `chunks_generated` integer NOT NULL DEFAULT 0,
  `embeddings_created` integer NOT NULL DEFAULT 0,
  `errors_count` integer NOT NULL DEFAULT 0,
  `warnings_count` integer NOT NULL DEFAULT 0,
  `started_at` text NOT NULL,
  `finished_at` text,
  CHECK (`run_kind` IN ('initial','daily','manual')),
  CHECK (`status` IN ('running','success','partial','failed')),
  CHECK (`target_count`=100)
);
--> statement-breakpoint

CREATE TABLE `npa_manual_review_report` (
  `id` text PRIMARY KEY NOT NULL,
  `document_key` text NOT NULL,
  `run_id` text,
  `reason_code` text NOT NULL,
  `details` text NOT NULL,
  `source_reference` text,
  `created_at` text NOT NULL,
  `resolved_at` text,
  FOREIGN KEY (`document_key`) REFERENCES `npa_master_targets`(`document_key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`run_id`) REFERENCES `npa_ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (`reason_code` IN ('LEXUZ_CARD_NOT_FOUND','IDENTITY_MISMATCH','METADATA_INCOMPLETE','FUTURE_EFFECTIVE_DATE_UNCONFIRMED','LANGUAGE_LABEL_AMBIGUOUS','FULL_TEXT_UNAVAILABLE','STRUCTURAL_PARSE_FAILED','VERSION_INTERVAL_AMBIGUOUS')),
  CHECK (length(trim(`details`)) BETWEEN 3 AND 1500),
  CHECK (`source_reference` IS NULL OR `source_reference` GLOB 'https://lex.uz/*')
);
--> statement-breakpoint
CREATE INDEX `npa_manual_review_open_idx`
  ON `npa_manual_review_report` (`document_key`,`resolved_at`,`created_at`);
