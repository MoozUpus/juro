-- Immutable, multilingual legal-corpus registry. Lex.uz and trusted uploads
-- are available after technical validation; no legal-approval queue is used.
CREATE TABLE `legal_corpus_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `jurisdiction` text NOT NULL,
  `source_class` text NOT NULL,
  `scope` text NOT NULL DEFAULT 'global',
  `tenant_id` text,
  `owner_user_id` text,
  `matter_id` text,
  `visibility` text NOT NULL DEFAULT 'global',
  `canonical_url` text,
  `title` text NOT NULL,
  `short_title` text,
  `document_type` text,
  `document_number` text,
  `adopting_authority` text,
  `adoption_date` text,
  `publication_date` text,
  `availability_status` text NOT NULL DEFAULT 'ready',
  `trusted` integer NOT NULL DEFAULT 1,
  `verification_status` text NOT NULL,
  `approval_required` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_corpus_document_provider_check` CHECK (`provider` IN ('lex_uz','juro_owner','tenant_upload','user_upload','internal','derived_translation')),
  CONSTRAINT `legal_corpus_document_jurisdiction_check` CHECK (`jurisdiction`='UZ'),
  CONSTRAINT `legal_corpus_document_source_class_check` CHECK (`source_class` IN ('OFFICIAL_LEGISLATION','OFFICIAL_GOVERNMENT_GUIDANCE','OWNER_TRUSTED_GLOBAL','TENANT_TRUSTED_PRIVATE','USER_TRUSTED_PRIVATE','DERIVED_TRANSLATION','SECONDARY_REFERENCE')),
  CONSTRAINT `legal_corpus_document_scope_check` CHECK (`scope` IN ('global','tenant','user')),
  CONSTRAINT `legal_corpus_document_visibility_check` CHECK (`visibility` IN ('global','tenant','private')),
  CONSTRAINT `legal_corpus_document_availability_check` CHECK (`availability_status` IN ('ready','processing','technical_quarantine','failed','disabled')),
  CONSTRAINT `legal_corpus_document_trust_check` CHECK (`trusted`=1 AND `approval_required`=0),
  CONSTRAINT `legal_corpus_document_verification_check` CHECK (`verification_status` IN ('official_source','official_live_source','owner_approved','tenant_supplied','user_supplied','derived_translation','secondary_reference')),
  CONSTRAINT `legal_corpus_document_url_check` CHECK (`canonical_url` IS NULL OR (length(`canonical_url`) BETWEEN 12 AND 2048 AND `canonical_url` LIKE 'https://%')),
  CONSTRAINT `legal_corpus_document_scope_identity_check` CHECK (
    (`scope`='global' AND `tenant_id` IS NULL AND `owner_user_id` IS NULL)
    OR (`scope`='tenant' AND length(`tenant_id`)>0)
    OR (`scope`='user' AND length(`owner_user_id`)>0)
  )
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_documents_provider_idx` ON `legal_corpus_documents` (`provider`,`availability_status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_documents_scope_idx` ON `legal_corpus_documents` (`scope`,`tenant_id`,`owner_user_id`,`matter_id`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_variants` (
  `id` text PRIMARY KEY NOT NULL,
  `document_id` text NOT NULL,
  `language` text NOT NULL,
  `is_official_language_version` integer NOT NULL,
  `translation_type` text,
  -- Private uploads are stored in private R2 and deliberately have no public
  -- source URL. Official variants always carry their Lex.uz URL.
  `source_url` text,
  `last_verified_at` text NOT NULL,
  `current_version_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_variant_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_variant_official_check` CHECK ((`is_official_language_version`=1 AND `translation_type` IS NULL) OR (`is_official_language_version`=0 AND `translation_type`='machine')),
  CONSTRAINT `legal_corpus_variant_url_check` CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_variants_document_language_uidx` ON `legal_corpus_variants` (`document_id`,`language`,`is_official_language_version`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `variant_id` text NOT NULL,
  `previous_version_id` text,
  `version_number` integer NOT NULL,
  `status` text NOT NULL,
  `valid_from` text,
  `valid_to` text,
  `version_date` text,
  `content_sha256` text NOT NULL,
  `raw_object_key` text,
  `normalized_object_key` text,
  `source_url` text,
  `fetched_at` text NOT NULL,
  `change_type` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`previous_version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_version_number_check` CHECK (`version_number`>=1),
  CONSTRAINT `legal_corpus_version_status_check` CHECK (`status` IN ('active','repealed','historical','unknown')),
  CONSTRAINT `legal_corpus_version_interval_check` CHECK (`valid_to` IS NULL OR `valid_from` IS NULL OR `valid_to`>`valid_from`),
  CONSTRAINT `legal_corpus_version_hash_check` CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_corpus_version_change_check` CHECK (`change_type` IN ('new','modified','repealed','renumbered','moved','metadata_changed','suspicious_change','unchanged')),
  CONSTRAINT `legal_corpus_version_url_check` CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_versions_variant_number_uidx` ON `legal_corpus_versions` (`variant_id`,`version_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_versions_variant_hash_uidx` ON `legal_corpus_versions` (`variant_id`,`content_sha256`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_versions_current_idx` ON `legal_corpus_versions` (`variant_id`,`status`,`valid_from`,`valid_to`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_provisions` (
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
  CONSTRAINT `legal_corpus_provision_sequence_check` CHECK (`sequence`>=0),
  CONSTRAINT `legal_corpus_provision_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_provision_status_check` CHECK (`status` IN ('active','repealed','historical','unknown')),
  CONSTRAINT `legal_corpus_provision_interval_check` CHECK (`valid_to` IS NULL OR `valid_from` IS NULL OR `valid_to`>`valid_from`),
  CONSTRAINT `legal_corpus_provision_text_check` CHECK (length(trim(`text`))>0 AND length(trim(`exact_quote_source`))>0),
  CONSTRAINT `legal_corpus_provision_hash_check` CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_corpus_provision_url_check` CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_provisions_version_ref_uidx` ON `legal_corpus_provisions` (`version_id`,`article_number_normalized`,`sequence`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_provisions_lookup_idx` ON `legal_corpus_provisions` (`document_id`,`article_number_normalized`,`status`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_chunks` (
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
  CONSTRAINT `legal_corpus_chunk_order_check` CHECK (`chunk_index`>=0 AND `total_chunks`>=1 AND `chunk_index`<`total_chunks`),
  CONSTRAINT `legal_corpus_chunk_text_check` CHECK (length(trim(`content_text`))>0),
  CONSTRAINT `legal_corpus_chunk_hash_check` CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_chunks_provision_order_uidx` ON `legal_corpus_chunks` (`provision_id`,`chunk_index`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_chunks_vector_uidx` ON `legal_corpus_chunks` (`dense_vector_id`) WHERE `dense_vector_id` IS NOT NULL;
--> statement-breakpoint
-- The sparse side of hybrid retrieval. Rows are intentionally keyed by the
-- immutable chunk id; retrieval joins the variant's current version pointer
-- so historical text cannot leak into a present-day answer.
CREATE VIRTUAL TABLE `legal_corpus_search` USING fts5(
  `chunk_id` UNINDEXED,
  `version_id` UNINDEXED,
  `document_id` UNINDEXED,
  `language` UNINDEXED,
  `article_number` UNINDEXED,
  `title`,
  `content`,
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TABLE `legal_corpus_ingestion_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `job_type` text NOT NULL,
  `status` text NOT NULL,
  `provider` text NOT NULL,
  `canonical_document_id` text,
  `variant_id` text,
  `source_url` text,
  `language` text,
  `idempotency_key` text NOT NULL,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `max_attempts` integer NOT NULL DEFAULT 5,
  `next_attempt_at` text,
  `last_error_code` text,
  `correlation_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_ingestion_type_check` CHECK (`job_type` IN ('discover','fetch','extract','link_languages','version','index','verify','publish','retry')),
  CONSTRAINT `legal_corpus_ingestion_status_check` CHECK (`status` IN ('queued','running','retrying','completed','failed','dead_letter')),
  CONSTRAINT `legal_corpus_ingestion_provider_check` CHECK (`provider` IN ('lex_uz','juro_owner','tenant_upload','user_upload','internal','derived_translation')),
  CONSTRAINT `legal_corpus_ingestion_attempt_check` CHECK (`attempt_count`>=0 AND `max_attempts` BETWEEN 1 AND 12),
  CONSTRAINT `legal_corpus_ingestion_url_check` CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_ingestion_idempotency_uidx` ON `legal_corpus_ingestion_jobs` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_ingestion_ready_idx` ON `legal_corpus_ingestion_jobs` (`status`,`next_attempt_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_failures` (
  `id` text PRIMARY KEY NOT NULL,
  `job_id` text,
  `canonical_document_id` text,
  `source_url` text,
  `language` text,
  `attempted_at` text NOT NULL,
  `http_status` integer,
  `error_code` text NOT NULL,
  `safe_message` text NOT NULL,
  `retryable` integer NOT NULL,
  `retry_count` integer NOT NULL DEFAULT 0,
  `retry_state` text NOT NULL,
  FOREIGN KEY (`job_id`) REFERENCES `legal_corpus_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `legal_corpus_failure_status_check` CHECK (`http_status` IS NULL OR (`http_status`>=100 AND `http_status`<=599)),
  CONSTRAINT `legal_corpus_failure_retryable_check` CHECK (`retryable` IN (0,1)),
  CONSTRAINT `legal_corpus_failure_state_check` CHECK (`retry_state` IN ('pending','retrying','terminal','technically_unavailable')),
  CONSTRAINT `legal_corpus_failure_url_check` CHECK (`source_url` IS NULL OR (length(`source_url`) BETWEEN 12 AND 2048 AND `source_url` LIKE 'https://%'))
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_failures_document_idx` ON `legal_corpus_failures` (`canonical_document_id`,`language`,`attempted_at`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `run_kind` text NOT NULL,
  `status` text NOT NULL,
  `snapshot_id` text,
  `discovered_count` integer NOT NULL DEFAULT 0,
  `fetched_count` integer NOT NULL DEFAULT 0,
  `extracted_count` integer NOT NULL DEFAULT 0,
  `indexed_count` integer NOT NULL DEFAULT 0,
  `failed_count` integer NOT NULL DEFAULT 0,
  `started_at` text NOT NULL,
  `finished_at` text,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_corpus_run_kind_check` CHECK (`run_kind` IN ('initial','daily','weekly','monthly','live','manual')),
  CONSTRAINT `legal_corpus_run_status_check` CHECK (`status` IN ('running','success','partial','failed','halted_suspicious_change'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_runs_active_kind_uidx` ON `legal_corpus_runs` (`run_kind`) WHERE `status`='running';
--> statement-breakpoint
CREATE TABLE `legal_corpus_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `manifest_object_key` text NOT NULL,
  `registry_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  `created_by_run_id` text,
  FOREIGN KEY (`created_by_run_id`) REFERENCES `legal_corpus_runs`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `legal_corpus_snapshot_hash_check` CHECK (length(`registry_sha256`)=64 AND `registry_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_versions_immutable_guard` BEFORE UPDATE ON `legal_corpus_versions`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_VERSION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_versions_no_delete` BEFORE DELETE ON `legal_corpus_versions`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_VERSION_DELETE_FORBIDDEN'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_provisions_immutable_guard` BEFORE UPDATE ON `legal_corpus_provisions`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_provisions_no_delete` BEFORE DELETE ON `legal_corpus_provisions`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_DELETE_FORBIDDEN'); END;
