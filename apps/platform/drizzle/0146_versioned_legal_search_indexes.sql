-- Builds are mutable, resumable workspaces. A completed build is finalized
-- into the immutable release tables below; active retrieval never reads a
-- build row directly.
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
CREATE UNIQUE INDEX `legal_search_build_collection_uidx`
ON `legal_corpus_search_index_builds` (`environment`,`qdrant_collection`);
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
CREATE INDEX `legal_search_build_versions_version_idx`
ON `legal_corpus_search_index_build_versions` (`build_id`,`version_id`);
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
CREATE TRIGGER `legal_search_builds_no_delete`
BEFORE DELETE ON `legal_corpus_search_index_builds`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_build_versions_no_update`
BEFORE UPDATE ON `legal_corpus_search_index_build_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_build_versions_no_delete`
BEFORE DELETE ON `legal_corpus_search_index_build_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_BUILD_IMMUTABLE'); END;
--> statement-breakpoint
-- A search release is one immutable pair: a frozen D1 sparse view and one
-- Qdrant collection built with a pinned embedding/reranker contract.
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
CREATE UNIQUE INDEX `legal_search_manifest_collection_uidx`
ON `legal_corpus_search_index_manifests` (`environment`,`qdrant_collection`);
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
CREATE INDEX `legal_search_index_versions_version_idx`
ON `legal_corpus_search_index_versions` (`manifest_id`,`version_id`);
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
CREATE INDEX `legal_search_activation_latest_idx`
ON `legal_corpus_search_index_activations` (`environment`,`created_at` DESC,`id` DESC);
--> statement-breakpoint
CREATE TRIGGER `legal_search_manifests_no_update`
BEFORE UPDATE ON `legal_corpus_search_index_manifests`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_manifests_no_delete`
BEFORE DELETE ON `legal_corpus_search_index_manifests`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_index_versions_no_update`
BEFORE UPDATE ON `legal_corpus_search_index_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_index_versions_no_delete`
BEFORE DELETE ON `legal_corpus_search_index_versions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_activations_no_update`
BEFORE UPDATE ON `legal_corpus_search_index_activations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_ACTIVATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_activations_no_delete`
BEFORE DELETE ON `legal_corpus_search_index_activations`
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
