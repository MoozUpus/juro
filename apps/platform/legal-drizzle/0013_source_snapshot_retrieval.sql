-- Additive source-snapshot retrieval model. Legacy Instrument, Official
-- Expression, textual-authority, relationship and eligibility evidence stays
-- immutable and available for audit, but does not gate this projection.
CREATE TABLE `legal_source_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `publisher` text NOT NULL,
  `publisher_document_token` text NOT NULL UNIQUE,
  `language_tag` text NOT NULL,
  `source_url` text NOT NULL,
  `legacy_instrument_id` text,
  `legacy_expression_id` text UNIQUE,
  `provenance_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`legacy_instrument_id`) REFERENCES `legal_instruments`(`id`) ON DELETE restrict,
  FOREIGN KEY (`legacy_expression_id`) REFERENCES `legal_official_expressions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_document_publisher_check` CHECK (`publisher`='lex.uz'),
  CONSTRAINT `legal_source_document_language_check`
    CHECK (`language_tag` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_source_document_hash_check`
    CHECK (length(`provenance_sha256`)=64 AND `provenance_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `source_document_id` text NOT NULL,
  `publisher_revision_token` text NOT NULL,
  `language_tag` text NOT NULL,
  `capture_id` text NOT NULL,
  `raw_locator_id` text NOT NULL,
  `normalized_locator_id` text NOT NULL,
  `content_sha256` text NOT NULL,
  `captured_at` text NOT NULL,
  `legacy_text_revision_id` text NOT NULL UNIQUE,
  `created_at` text NOT NULL,
  FOREIGN KEY (`source_document_id`) REFERENCES `legal_source_documents`(`id`) ON DELETE restrict,
  FOREIGN KEY (`raw_locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict,
  FOREIGN KEY (`normalized_locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict,
  FOREIGN KEY (`legacy_text_revision_id`) REFERENCES `legal_text_revisions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_snapshot_language_check`
    CHECK (`language_tag` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_source_snapshot_hash_check`
    CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*'),
  UNIQUE (`source_document_id`,`publisher_revision_token`,`language_tag`,`capture_id`,`content_sha256`)
);
--> statement-breakpoint
CREATE TABLE `legal_snapshot_provisions` (
  `id` text PRIMARY KEY NOT NULL,
  `source_snapshot_id` text NOT NULL,
  `source_position_token` text NOT NULL,
  `sequence` integer NOT NULL,
  `normalized_content_sha256` text NOT NULL,
  `provision_locator_id` text NOT NULL,
  `source_url` text NOT NULL,
  `temporal_state` text NOT NULL,
  `privacy_class` text NOT NULL,
  `legacy_provision_rendition_id` text NOT NULL UNIQUE,
  `created_at` text NOT NULL,
  FOREIGN KEY (`source_snapshot_id`) REFERENCES `legal_source_snapshots`(`id`) ON DELETE restrict,
  FOREIGN KEY (`provision_locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict,
  FOREIGN KEY (`legacy_provision_rendition_id`) REFERENCES `legal_provision_renditions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_snapshot_provision_sequence_check` CHECK (`sequence`>=0),
  CONSTRAINT `legal_snapshot_provision_hash_check`
    CHECK (length(`normalized_content_sha256`)=64
      AND `normalized_content_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_snapshot_provision_temporal_check`
    CHECK (`temporal_state` IN ('current_supported','unknown','historical_only','disputed')),
  CONSTRAINT `legal_snapshot_provision_privacy_check`
    CHECK (`privacy_class` IN ('public_official_source','private','unknown')),
  UNIQUE (`source_snapshot_id`,`source_position_token`,`normalized_content_sha256`)
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_current_pointers` (
  `id` text PRIMARY KEY NOT NULL,
  `build_id` text NOT NULL,
  `source_document_id` text NOT NULL,
  `source_snapshot_id` text NOT NULL,
  `evidence_url` text NOT NULL,
  `verified_at` text NOT NULL,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`source_document_id`) REFERENCES `legal_source_documents`(`id`) ON DELETE restrict,
  FOREIGN KEY (`source_snapshot_id`) REFERENCES `legal_source_snapshots`(`id`) ON DELETE restrict,
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  UNIQUE (`build_id`,`source_document_id`),
  UNIQUE (`build_id`,`source_snapshot_id`)
);
--> statement-breakpoint
CREATE TABLE `legal_retrieval_eligibility` (
  `id` text PRIMARY KEY NOT NULL,
  `build_id` text NOT NULL,
  `snapshot_provision_id` text NOT NULL,
  `capability` text NOT NULL,
  `status` text NOT NULL,
  `reason_codes_json` text NOT NULL,
  `official_source_verified` integer NOT NULL,
  `d1_r2_integrity_verified` integer NOT NULL,
  `extraction_verified` integer NOT NULL,
  `identity_stable` integer NOT NULL,
  `current_pointer_verified` integer NOT NULL,
  `temporal_state_supported` integer NOT NULL,
  `privacy_verified` integer NOT NULL,
  `quarantine_clear` integer NOT NULL,
  `canonicalization_clear` integer NOT NULL,
  `evaluated_at` text NOT NULL,
  FOREIGN KEY (`snapshot_provision_id`) REFERENCES `legal_snapshot_provisions`(`id`) ON DELETE restrict,
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_retrieval_eligibility_capability_check`
    CHECK (`capability` IN ('current','as_of','comparison')),
  CONSTRAINT `legal_retrieval_eligibility_status_check`
    CHECK (`status` IN ('eligible','ineligible','gap')),
  CONSTRAINT `legal_retrieval_eligibility_boolean_check` CHECK (
    `official_source_verified` IN (0,1) AND `d1_r2_integrity_verified` IN (0,1)
    AND `extraction_verified` IN (0,1) AND `identity_stable` IN (0,1)
    AND `current_pointer_verified` IN (0,1) AND `temporal_state_supported` IN (0,1)
    AND `privacy_verified` IN (0,1) AND `quarantine_clear` IN (0,1)
    AND `canonicalization_clear` IN (0,1)),
  UNIQUE (`build_id`,`snapshot_provision_id`,`capability`)
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_quarantines` (
  `id` text PRIMARY KEY NOT NULL,
  `source_document_id` text NOT NULL,
  `source_version_token` text NOT NULL,
  `reason_code` text NOT NULL,
  `evidence_json` text NOT NULL,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`source_document_id`) REFERENCES `legal_source_documents`(`id`) ON DELETE restrict,
  UNIQUE (`source_document_id`,`source_version_token`,`reason_code`)
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `subject_type` text NOT NULL,
  `alias_identity` text NOT NULL,
  `canonical_identity` text NOT NULL,
  `reason_code` text NOT NULL,
  `evidence_json` text NOT NULL,
  `recorded_at` text NOT NULL,
  CONSTRAINT `legal_source_snapshot_alias_subject_check`
    CHECK (`subject_type` IN ('source_document','source_snapshot','snapshot_provision','canonical_chunk')),
  UNIQUE (`subject_type`,`alias_identity`)
);
--> statement-breakpoint
CREATE TABLE `legal_canonical_chunks` (
  `id` text PRIMARY KEY NOT NULL,
  `snapshot_provision_id` text NOT NULL,
  `ordinal` integer NOT NULL,
  `r2_key` text NOT NULL UNIQUE,
  `byte_count` integer NOT NULL,
  `sha256` text NOT NULL,
  `schema_version` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`snapshot_provision_id`) REFERENCES `legal_snapshot_provisions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_canonical_chunk_ordinal_check` CHECK (`ordinal`>=0),
  CONSTRAINT `legal_canonical_chunk_size_check` CHECK (`byte_count`>0),
  CONSTRAINT `legal_canonical_chunk_hash_check`
    CHECK (length(`sha256`)=64 AND `sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_canonical_chunk_schema_check` CHECK (`schema_version`=1),
  UNIQUE (`snapshot_provision_id`,`ordinal`)
);
--> statement-breakpoint
CREATE TABLE `legal_sparse_projection_postings` (
  `canonical_chunk_id` text PRIMARY KEY NOT NULL,
  `posting_inventory_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`canonical_chunk_id`) REFERENCES `legal_canonical_chunks`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_sparse_projection_hash_check`
    CHECK (length(`posting_inventory_sha256`)=64
      AND `posting_inventory_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_dense_projection_candidates` (
  `canonical_chunk_id` text PRIMARY KEY NOT NULL,
  `embedding_model` text NOT NULL,
  `dimensions` integer NOT NULL,
  `provider_candidate_id` text NOT NULL UNIQUE,
  `created_at` text NOT NULL,
  FOREIGN KEY (`canonical_chunk_id`) REFERENCES `legal_canonical_chunks`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_dense_projection_dimensions_check` CHECK (`dimensions`=1536)
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_release_members` (
  `search_release_id` text NOT NULL,
  `canonical_chunk_id` text NOT NULL,
  `snapshot_provision_id` text NOT NULL,
  `shard_id` text NOT NULL,
  PRIMARY KEY (`search_release_id`,`canonical_chunk_id`),
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`canonical_chunk_id`) REFERENCES `legal_canonical_chunks`(`id`) ON DELETE restrict,
  FOREIGN KEY (`snapshot_provision_id`) REFERENCES `legal_snapshot_provisions`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_builds` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `cutoff_at` text NOT NULL,
  `release_id` text NOT NULL,
  `configuration_identity` text NOT NULL,
  `shard_count` integer NOT NULL,
  `status` text NOT NULL,
  `phase` text NOT NULL,
  `cursor` text,
  `processed_count` integer NOT NULL DEFAULT 0,
  `eligible_count` integer NOT NULL DEFAULT 0,
  `excluded_count` integer NOT NULL DEFAULT 0,
  `inventory_sha256` text,
  `projection_sha256` text,
  `release_sha256` text,
  `error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_source_snapshot_build_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_source_snapshot_build_shard_check` CHECK (`shard_count` BETWEEN 1 AND 99),
  CONSTRAINT `legal_source_snapshot_build_status_check`
    CHECK (`status` IN ('building','complete','sealed','failed')),
  CONSTRAINT `legal_source_snapshot_build_phase_check`
    CHECK (`phase` IN ('inventory','projections','reconciliation','release','complete')),
  CONSTRAINT `legal_source_snapshot_build_count_check`
    CHECK (`processed_count`>=0 AND `eligible_count`>=0 AND `excluded_count`>=0)
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_build_checkpoints` (
  `build_id` text NOT NULL,
  `phase` text NOT NULL,
  `cursor` text,
  `item_count` integer NOT NULL,
  `identity_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`phase`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_snapshot_checkpoint_phase_check`
    CHECK (`phase` IN ('inventory','projections','release','reconciliation','recovery')),
  CONSTRAINT `legal_source_snapshot_checkpoint_count_check` CHECK (`item_count`>=0),
  CONSTRAINT `legal_source_snapshot_checkpoint_hash_check`
    CHECK (length(`identity_sha256`)=64 AND `identity_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_inventories` (
  `build_id` text NOT NULL,
  `inventory_kind` text NOT NULL,
  `item_count` integer NOT NULL,
  `inventory_sha256` text NOT NULL,
  `inventory_json` text NOT NULL,
  `recorded_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`inventory_kind`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_snapshot_inventory_count_check` CHECK (`item_count`>=0),
  CONSTRAINT `legal_source_snapshot_inventory_hash_check`
    CHECK (length(`inventory_sha256`)=64 AND `inventory_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_deferred_inventories` (
  `build_id` text NOT NULL,
  `inventory_kind` text NOT NULL,
  `item_count` integer NOT NULL,
  `inventory_sha256` text NOT NULL,
  `evidence_json` text NOT NULL,
  `recorded_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`inventory_kind`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `legal_source_snapshot_provision_lookup_idx`
ON `legal_snapshot_provisions` (`source_snapshot_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `legal_retrieval_eligibility_lookup_idx`
ON `legal_retrieval_eligibility` (`capability`,`status`,`snapshot_provision_id`);
--> statement-breakpoint
CREATE INDEX `legal_source_snapshot_release_shard_idx`
ON `legal_source_snapshot_release_members` (`search_release_id`,`shard_id`,`canonical_chunk_id`);
--> statement-breakpoint
CREATE TRIGGER `legal_source_documents_no_update` BEFORE UPDATE ON `legal_source_documents`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_DOCUMENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshots_no_update` BEFORE UPDATE ON `legal_source_snapshots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_snapshot_provisions_no_update` BEFORE UPDATE ON `legal_snapshot_provisions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SNAPSHOT_PROVISION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_current_pointers_no_update`
BEFORE UPDATE ON `legal_source_snapshot_current_pointers`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_POINTER_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_retrieval_eligibility_no_update` BEFORE UPDATE ON `legal_retrieval_eligibility`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RETRIEVAL_ELIGIBILITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_quarantines_no_update`
BEFORE UPDATE ON `legal_source_snapshot_quarantines`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_QUARANTINE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_aliases_no_update`
BEFORE UPDATE ON `legal_source_snapshot_aliases`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_ALIAS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_canonical_chunks_no_update` BEFORE UPDATE ON `legal_canonical_chunks`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CANONICAL_CHUNK_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_sparse_projection_postings_no_update`
BEFORE UPDATE ON `legal_sparse_projection_postings`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SPARSE_PROJECTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_dense_projection_candidates_no_update`
BEFORE UPDATE ON `legal_dense_projection_candidates`
BEGIN SELECT RAISE(ABORT, 'LEGAL_DENSE_PROJECTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_release_members_no_update`
BEFORE UPDATE ON `legal_source_snapshot_release_members`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_RELEASE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_build_checkpoints_no_update`
BEFORE UPDATE ON `legal_source_snapshot_build_checkpoints`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_CHECKPOINT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_inventories_no_update`
BEFORE UPDATE ON `legal_source_snapshot_inventories`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_INVENTORY_IMMUTABLE'); END;
