-- Retire the platform-D1 copy of official legal bodies and the Qdrant/sparse
-- projections. The accepted corpus, embeddings and release evidence remain
-- immutable in R2. Abort before any destructive statement if this database
-- contains tenant, user, owner or otherwise non-Lex corpus documents.
-- Dropping the largest derived index first creates enough transactional
-- headroom for the guard on a D1 database that has reached its size ceiling.
-- If the guard rejects the migration, D1 rolls the whole migration back.
DROP TABLE `legal_corpus_sparse_postings`;
--> statement-breakpoint
CREATE TABLE `_legal_corpus_retirement_guard` (
  `id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `_legal_corpus_retirement_private_data_guard`
BEFORE INSERT ON `_legal_corpus_retirement_guard`
WHEN EXISTS (
  SELECT 1 FROM `legal_corpus_documents`
  WHERE `provider`<>'lex_uz' OR `scope`<>'global' OR `visibility`<>'global'
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_RETIREMENT_PRIVATE_DATA_PRESENT'); END;
--> statement-breakpoint
INSERT INTO `_legal_corpus_retirement_guard` (`id`) VALUES (1);
--> statement-breakpoint
DROP TRIGGER `_legal_corpus_retirement_private_data_guard`;
--> statement-breakpoint
DROP TABLE `_legal_corpus_retirement_guard`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_activations`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_versions`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_manifests`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_build_versions`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_builds`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_chunk_keys`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_term_dictionary`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_terms`;
--> statement-breakpoint
DROP TABLE IF EXISTS `legal_corpus_search`;
--> statement-breakpoint
DROP TABLE `legal_corpus_chunks`;
--> statement-breakpoint
DROP TABLE `legal_corpus_provisions`;
--> statement-breakpoint
-- Empty compatibility tables keep rollback/recovery tooling able to inspect an
-- old export without retaining any body, posting, vector or activation row.
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
--> statement-breakpoint
CREATE TABLE `legal_corpus_sparse_term_dictionary` (
  `id` integer PRIMARY KEY NOT NULL,
  `term` text NOT NULL,
  CONSTRAINT `legal_corpus_sparse_dictionary_term_check` CHECK (length(`term`) BETWEEN 1 AND 81),
  UNIQUE (`term`)
);
--> statement-breakpoint
CREATE TABLE `legal_corpus_sparse_chunk_keys` (
  `id` integer PRIMARY KEY NOT NULL,
  `chunk_id` text NOT NULL,
  FOREIGN KEY (`chunk_id`) REFERENCES `legal_corpus_chunks`(`id`) ON UPDATE no action ON DELETE restrict,
  UNIQUE (`chunk_id`)
);
--> statement-breakpoint
CREATE TABLE `legal_corpus_sparse_postings` (
  `term_id` integer NOT NULL,
  `chunk_key_id` integer NOT NULL,
  `term_frequency` integer NOT NULL,
  `title_frequency` integer NOT NULL DEFAULT 0,
  `article_frequency` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`term_id`,`chunk_key_id`),
  FOREIGN KEY (`term_id`) REFERENCES `legal_corpus_sparse_term_dictionary`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`chunk_key_id`) REFERENCES `legal_corpus_sparse_chunk_keys`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_compressed_sparse_frequency_check` CHECK (`term_frequency`>=0 AND `title_frequency`>=0 AND `article_frequency`>=0),
  CONSTRAINT `legal_corpus_compressed_sparse_nonempty_check` CHECK (`term_frequency`+`title_frequency`+`article_frequency`>0)
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_sparse_postings_chunk_key_idx` ON `legal_corpus_sparse_postings` (`chunk_key_id`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_search_index_builds` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `qdrant_collection` text NOT NULL,
  `sparse_schema_version` text NOT NULL,
  `embedding_model` text NOT NULL,
  `embedding_schema_version` text NOT NULL,
  `reranker_model` text NOT NULL,
  `reranker_version` text NOT NULL,
  `variant_count` integer NOT NULL,
  `chunk_count` integer NOT NULL,
  `indexed_chunk_count` integer DEFAULT 0 NOT NULL,
  `last_chunk_id` text,
  `status` text DEFAULT 'building' NOT NULL,
  `error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_search_build_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_search_build_collection_check` CHECK (length(`qdrant_collection`) BETWEEN 1 AND 80 AND `qdrant_collection` NOT GLOB '*[^A-Za-z0-9_-]*'),
  CONSTRAINT `legal_search_build_counts_check` CHECK (`variant_count`>0 AND `chunk_count`>0 AND `indexed_chunk_count` BETWEEN 0 AND `chunk_count`),
  CONSTRAINT `legal_search_build_status_check` CHECK (`status` IN ('building','complete','finalized','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_search_build_collection_uidx` ON `legal_corpus_search_index_builds` (`environment`,`qdrant_collection`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_search_index_build_versions` (
  `build_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `version_id` text NOT NULL,
  PRIMARY KEY (`build_id`,`variant_id`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_corpus_search_index_builds`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `legal_search_build_versions_version_idx` ON `legal_corpus_search_index_build_versions` (`build_id`,`version_id`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_search_index_manifests` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `qdrant_collection` text NOT NULL,
  `sparse_schema_version` text NOT NULL,
  `embedding_model` text NOT NULL,
  `embedding_schema_version` text NOT NULL,
  `reranker_model` text NOT NULL,
  `reranker_version` text NOT NULL,
  `variant_count` integer NOT NULL,
  `chunk_count` integer NOT NULL,
  `dense_point_count` integer NOT NULL,
  `corpus_cutoff_at` text NOT NULL,
  `manifest_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_search_manifest_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_search_manifest_collection_check` CHECK (length(`qdrant_collection`) BETWEEN 1 AND 80 AND `qdrant_collection` NOT GLOB '*[^A-Za-z0-9_-]*'),
  CONSTRAINT `legal_search_manifest_counts_check` CHECK (`variant_count`>0 AND `chunk_count`>0 AND `dense_point_count`>=0 AND `dense_point_count`<=`chunk_count`),
  CONSTRAINT `legal_search_manifest_hash_check` CHECK (length(`manifest_sha256`)=64 AND `manifest_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_search_manifest_collection_uidx` ON `legal_corpus_search_index_manifests` (`environment`,`qdrant_collection`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_search_index_versions` (
  `manifest_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `version_id` text NOT NULL,
  PRIMARY KEY (`manifest_id`,`variant_id`),
  FOREIGN KEY (`manifest_id`) REFERENCES `legal_corpus_search_index_manifests`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `legal_search_index_versions_version_idx` ON `legal_corpus_search_index_versions` (`manifest_id`,`version_id`);
--> statement-breakpoint
CREATE TABLE `legal_corpus_search_index_activations` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `manifest_id` text NOT NULL,
  `previous_manifest_id` text,
  `action` text NOT NULL,
  `reason` text NOT NULL,
  `actor` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`manifest_id`) REFERENCES `legal_corpus_search_index_manifests`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`previous_manifest_id`) REFERENCES `legal_corpus_search_index_manifests`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_search_activation_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_search_activation_action_check` CHECK (`action` IN ('activate','rollback')),
  CONSTRAINT `legal_search_activation_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
  CONSTRAINT `legal_search_activation_actor_check` CHECK (length(trim(`actor`)) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE INDEX `legal_search_activation_latest_idx` ON `legal_corpus_search_index_activations` (`environment`,`created_at` DESC,`id` DESC);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_provisions_immutable_guard` BEFORE UPDATE ON `legal_corpus_provisions`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_provisions_no_delete` BEFORE DELETE ON `legal_corpus_provisions`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_DELETE_FORBIDDEN'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_build_identity_guard`
BEFORE UPDATE ON `legal_corpus_search_index_builds`
WHEN NEW.`id`<>OLD.`id` OR NEW.`environment`<>OLD.`environment`
  OR NEW.`qdrant_collection`<>OLD.`qdrant_collection`
  OR NEW.`sparse_schema_version`<>OLD.`sparse_schema_version`
  OR NEW.`embedding_model`<>OLD.`embedding_model`
  OR NEW.`embedding_schema_version`<>OLD.`embedding_schema_version`
  OR NEW.`reranker_model`<>OLD.`reranker_model`
  OR NEW.`reranker_version`<>OLD.`reranker_version`
  OR NEW.`variant_count`<>OLD.`variant_count`
  OR NEW.`chunk_count`<>OLD.`chunk_count`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_builds_no_delete` BEFORE DELETE ON `legal_corpus_search_index_builds`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_build_versions_no_update` BEFORE UPDATE ON `legal_corpus_search_index_build_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_build_versions_no_delete` BEFORE DELETE ON `legal_corpus_search_index_build_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_manifests_no_update` BEFORE UPDATE ON `legal_corpus_search_index_manifests`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_manifests_no_delete` BEFORE DELETE ON `legal_corpus_search_index_manifests`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_index_versions_no_update` BEFORE UPDATE ON `legal_corpus_search_index_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_index_versions_no_delete` BEFORE DELETE ON `legal_corpus_search_index_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_activations_no_update` BEFORE UPDATE ON `legal_corpus_search_index_activations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_ACTIVATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_activations_no_delete` BEFORE DELETE ON `legal_corpus_search_index_activations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_ACTIVATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_activation_guard`
BEFORE INSERT ON `legal_corpus_search_index_activations`
WHEN NOT EXISTS (
  SELECT 1 FROM `legal_corpus_search_index_manifests` manifest
  WHERE manifest.`id`=NEW.`manifest_id` AND manifest.`environment`=NEW.`environment`
    AND manifest.`dense_point_count`=manifest.`chunk_count`
)
OR COALESCE(NEW.`previous_manifest_id`,'') <> COALESCE((
  SELECT activation.`manifest_id` FROM `legal_corpus_search_index_activations` activation
  WHERE activation.`environment`=NEW.`environment`
  ORDER BY activation.`created_at` DESC,activation.`id` DESC LIMIT 1
),'')
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_ACTIVATION_REJECTED'); END;
