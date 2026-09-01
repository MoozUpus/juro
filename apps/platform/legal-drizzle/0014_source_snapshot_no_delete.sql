-- Authority-independent canonical identities are additive mappings. The
-- original identifiers remain immutable legacy-surrogate links.
CREATE TABLE `legal_source_snapshot_stable_identities` (
  `subject_type` text NOT NULL,
  `subject_id` text NOT NULL,
  `canonical_identity_sha256` text NOT NULL,
  `identity_evidence_json` text NOT NULL,
  `recorded_at` text NOT NULL,
  PRIMARY KEY (`subject_type`,`subject_id`),
  UNIQUE (`subject_type`,`canonical_identity_sha256`),
  CONSTRAINT `legal_source_snapshot_stable_identity_subject_check`
    CHECK (`subject_type` IN ('source_document','source_snapshot','snapshot_provision')),
  CONSTRAINT `legal_source_snapshot_stable_identity_hash_check`
    CHECK (length(`canonical_identity_sha256`)=64
      AND `canonical_identity_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_integrity_attestations` (
  `build_id` text NOT NULL,
  `snapshot_provision_id` text NOT NULL,
  `source_object_r2_key` text NOT NULL,
  `source_object_byte_count` integer NOT NULL,
  `source_object_sha256` text NOT NULL,
  `normalized_text_sha256` text NOT NULL,
  `verified_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`snapshot_provision_id`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  FOREIGN KEY (`snapshot_provision_id`) REFERENCES `legal_snapshot_provisions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_snapshot_integrity_size_check` CHECK (`source_object_byte_count`>0),
  CONSTRAINT `legal_source_snapshot_integrity_hash_check` CHECK (
    length(`source_object_sha256`)=64 AND `source_object_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`normalized_text_sha256`)=64
    AND `normalized_text_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_replay_pages` (
  `build_id` text NOT NULL,
  `run_id` text NOT NULL,
  `lane` text NOT NULL,
  `page` integer NOT NULL,
  `last_snapshot_provision_id` text NOT NULL,
  `item_count` integer NOT NULL,
  `identity_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`run_id`,`lane`,`page`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_snapshot_replay_run_check` CHECK (`run_id` IN ('baseline','repeat')),
  CONSTRAINT `legal_source_snapshot_replay_lane_check` CHECK (`lane` GLOB '[0-9a-f][0-9a-f]'),
  CONSTRAINT `legal_source_snapshot_replay_count_check` CHECK (`page`>=0 AND `item_count`>0),
  CONSTRAINT `legal_source_snapshot_replay_hash_check`
    CHECK (length(`identity_sha256`)=64 AND `identity_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_replay_runs` (
  `build_id` text NOT NULL,
  `run_id` text NOT NULL,
  `item_count` integer NOT NULL,
  `identity_sha256` text NOT NULL,
  `status` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`run_id`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_source_snapshot_replay_status_check` CHECK (`status`='clean'),
  CONSTRAINT `legal_source_snapshot_replay_run_count_check` CHECK (`item_count`>0),
  CONSTRAINT `legal_source_snapshot_replay_run_hash_check`
    CHECK (length(`identity_sha256`)=64 AND `identity_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_source_snapshot_qualifications` (
  `build_id` text PRIMARY KEY NOT NULL,
  `release_id` text NOT NULL,
  `recovery_sql_sha256` text NOT NULL,
  `recovery_sqlite_sha256` text NOT NULL,
  `validation_sha256` text NOT NULL,
  `standards_review_sha256` text NOT NULL,
  `spec_review_sha256` text NOT NULL,
  `qualification_sha256` text NOT NULL,
  `qualified_at` text NOT NULL,
  FOREIGN KEY (`build_id`) REFERENCES `legal_source_snapshot_builds`(`id`) ON DELETE restrict,
  FOREIGN KEY (`release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict
);
--> statement-breakpoint
-- Source Snapshot evidence and release projections are append-only. The
-- mutable build coordinator remains updateable, but evidence produced by a
-- build cannot be rewritten or removed after it has been observed.
CREATE TRIGGER `legal_source_documents_no_delete` BEFORE DELETE ON `legal_source_documents`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_DOCUMENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshots_no_delete` BEFORE DELETE ON `legal_source_snapshots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_snapshot_provisions_no_delete` BEFORE DELETE ON `legal_snapshot_provisions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SNAPSHOT_PROVISION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_current_pointers_no_delete`
BEFORE DELETE ON `legal_source_snapshot_current_pointers`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_POINTER_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_retrieval_eligibility_no_delete` BEFORE DELETE ON `legal_retrieval_eligibility`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RETRIEVAL_ELIGIBILITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_quarantines_no_delete`
BEFORE DELETE ON `legal_source_snapshot_quarantines`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_QUARANTINE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_aliases_no_delete`
BEFORE DELETE ON `legal_source_snapshot_aliases`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_ALIAS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_canonical_chunks_no_delete` BEFORE DELETE ON `legal_canonical_chunks`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CANONICAL_CHUNK_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_sparse_projection_postings_no_delete`
BEFORE DELETE ON `legal_sparse_projection_postings`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SPARSE_PROJECTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_dense_projection_candidates_no_delete`
BEFORE DELETE ON `legal_dense_projection_candidates`
BEGIN SELECT RAISE(ABORT, 'LEGAL_DENSE_PROJECTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_release_members_no_delete`
BEFORE DELETE ON `legal_source_snapshot_release_members`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_RELEASE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_build_checkpoints_no_delete`
BEFORE DELETE ON `legal_source_snapshot_build_checkpoints`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_CHECKPOINT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_inventories_no_delete`
BEFORE DELETE ON `legal_source_snapshot_inventories`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_INVENTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_deferred_inventories_no_delete`
BEFORE DELETE ON `legal_source_snapshot_deferred_inventories`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_DEFERRED_INVENTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_stable_identities_no_update`
BEFORE UPDATE ON `legal_source_snapshot_stable_identities`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_STABLE_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_stable_identities_no_delete`
BEFORE DELETE ON `legal_source_snapshot_stable_identities`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_STABLE_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_integrity_attestations_no_update`
BEFORE UPDATE ON `legal_source_snapshot_integrity_attestations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_INTEGRITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_integrity_attestations_no_delete`
BEFORE DELETE ON `legal_source_snapshot_integrity_attestations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_INTEGRITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_replay_pages_no_update`
BEFORE UPDATE ON `legal_source_snapshot_replay_pages`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_REPLAY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_replay_pages_no_delete`
BEFORE DELETE ON `legal_source_snapshot_replay_pages`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_REPLAY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_replay_runs_no_update`
BEFORE UPDATE ON `legal_source_snapshot_replay_runs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_REPLAY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_replay_runs_no_delete`
BEFORE DELETE ON `legal_source_snapshot_replay_runs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_REPLAY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_qualifications_no_update`
BEFORE UPDATE ON `legal_source_snapshot_qualifications`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_QUALIFICATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_qualifications_no_delete`
BEFORE DELETE ON `legal_source_snapshot_qualifications`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_QUALIFICATION_IMMUTABLE'); END;
