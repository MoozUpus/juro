CREATE TABLE `legal_complete_corpus_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `schema_version` text NOT NULL,
  `source_cutoff` text NOT NULL,
  `source_bookmark` text NOT NULL,
  `source_inventory_sha256` text NOT NULL,
  `source_canonical_sha256` text NOT NULL,
  `source_alias_sha256` text NOT NULL,
  `source_r2_object_manifest_sha256` text NOT NULL,
  `source_r2_alias_manifest_sha256` text NOT NULL,
  `source_empty_version_manifest_sha256` text NOT NULL,
  `plan_r2_key` text,
  `plan_sha256` text,
  `final_reconstruction_r2_key` text,
  `final_reconstruction_sha256` text,
  `status` text NOT NULL,
  `expected_record_count` integer NOT NULL,
  `materialized_record_count` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text,
  CONSTRAINT `legal_complete_corpus_run_schema_check` CHECK (`schema_version`='complete-corpus-materialization-v1'),
  CONSTRAINT `legal_complete_corpus_run_status_check` CHECK (`status` IN ('building','materialized','complete','failed')),
  CONSTRAINT `legal_complete_corpus_run_count_check` CHECK (`expected_record_count`>=0 AND `materialized_record_count`>=0),
  CONSTRAINT `legal_complete_corpus_run_hash_check` CHECK (
    length(`source_inventory_sha256`)=64 AND `source_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`source_canonical_sha256`)=64 AND `source_canonical_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`source_alias_sha256`)=64 AND `source_alias_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`source_r2_object_manifest_sha256`)=64 AND `source_r2_object_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`source_r2_alias_manifest_sha256`)=64 AND `source_r2_alias_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`source_empty_version_manifest_sha256`)=64 AND `source_empty_version_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`plan_sha256`)=64 AND `plan_sha256` NOT GLOB '*[^0-9a-f]*'
  )
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_objects` (
  `run_id` text NOT NULL,
  `object_kind` text NOT NULL,
  `sha256` text NOT NULL,
  `r2_key` text NOT NULL,
  `byte_count` integer NOT NULL,
  `materialization_disposition` text NOT NULL,
  `media_type` text NOT NULL,
  `schema_version` text NOT NULL,
  `normalization_version` text NOT NULL,
  `source_r2_key` text,
  `source_sha256` text,
  `source_normalized_sha256` text,
  `descriptor_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  UNIQUE (`run_id`,`object_kind`,`sha256`),
  UNIQUE (`run_id`,`r2_key`),
  CONSTRAINT `legal_complete_corpus_object_kind_check` CHECK (`object_kind` IN ('raw_capture','normalized_revision','provision_rendition','plan','manifest','reconstruction','corpus_snapshot')),
  CONSTRAINT `legal_complete_corpus_object_count_check` CHECK (`byte_count`>=0),
  CONSTRAINT `legal_complete_corpus_object_disposition_check` CHECK (`materialization_disposition` IN ('created','reused')),
  CONSTRAINT `legal_complete_corpus_object_hash_check` CHECK (length(`sha256`)=64 AND `sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_records` (
  `run_id` text NOT NULL,
  `source_id` text NOT NULL,
  `source_document_id` text NOT NULL,
  `source_version_id` text NOT NULL,
  `instrument_id` text NOT NULL,
  `official_expression_id` text NOT NULL,
  `text_revision_id` text NOT NULL,
  `provision_concept_id` text NOT NULL,
  `provision_rendition_id` text NOT NULL,
  `legacy_current_rendition_id` text NOT NULL,
  `publisher_revision_token` text NOT NULL,
  `legacy_target_publisher_revision_token` text NOT NULL,
  `source_publisher_revision_token` text NOT NULL,
  `publisher_provision_token` text NOT NULL,
  `applicability_identity` text NOT NULL,
  `identity_stage` text NOT NULL,
  `textual_authority` text NOT NULL,
  `provision_source_url` text,
  `version_source_url` text,
  `previous_source_version_id` text,
  `source_change_type` text NOT NULL,
  `source_revision_sha256` text NOT NULL,
  `object_metadata_revision_sha256` text NOT NULL,
  `record_sha256` text NOT NULL,
  `legal_identity_sha256` text NOT NULL,
  `material_sha256` text NOT NULL,
  `content_sha256` text NOT NULL,
  `raw_source_r2_key` text NOT NULL,
  `raw_source_sha256` text NOT NULL,
  `normalized_source_r2_key` text NOT NULL,
  `normalized_source_sha256` text NOT NULL,
  `raw_object_r2_key` text NOT NULL,
  `normalized_object_r2_key` text NOT NULL,
  `provision_object_r2_key` text NOT NULL,
  `provision_object_sha256` text NOT NULL,
  `language` text NOT NULL,
  `script` text NOT NULL,
  `ordinal` integer NOT NULL,
  `valid_from` text,
  `valid_to` text,
  `current_eligible` integer NOT NULL,
  `historical_eligible` integer NOT NULL,
  `temporal_gap` integer NOT NULL,
  `quarantined` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  UNIQUE (`run_id`,`legal_identity_sha256`),
  UNIQUE (`run_id`,`source_id`),
  UNIQUE (`run_id`,`provision_rendition_id`),
  CONSTRAINT `legal_complete_corpus_record_ordinal_check` CHECK (`ordinal`>=0),
  CONSTRAINT `legal_complete_corpus_record_identity_stage_check` CHECK (`identity_stage`='ticket29-provisional-v1'),
  CONSTRAINT `legal_complete_corpus_record_boolean_check` CHECK (`current_eligible` IN (0,1) AND `historical_eligible` IN (0,1) AND `temporal_gap` IN (0,1) AND `quarantined` IN (0,1)),
  CONSTRAINT `legal_complete_corpus_record_temporal_check` CHECK ((`temporal_gap`=1 AND `valid_from` IS NULL AND `current_eligible`=0 AND `historical_eligible`=0) OR (`temporal_gap`=0 AND `valid_from` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_aliases` (
  `run_id` text NOT NULL,
  `owner_kind` text NOT NULL,
  `owner_id` text NOT NULL,
  `target_identity` text NOT NULL,
  `alias_kind` text NOT NULL,
  `alias_sha256` text NOT NULL,
  `alias_value` text NOT NULL,
  `row_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  UNIQUE (`run_id`,`owner_kind`,`owner_id`,`alias_kind`),
  CONSTRAINT `legal_complete_corpus_alias_owner_check` CHECK (`owner_kind`='source_version'),
  CONSTRAINT `legal_complete_corpus_alias_kind_check` CHECK (`alias_kind` IN ('raw_capture','normalized_revision','version_url'))
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_lineage_refs` (
  `run_id` text NOT NULL,
  `source_version_id` text NOT NULL,
  `previous_source_version_id` text,
  `change_type` text NOT NULL,
  `row_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE (`run_id`,`source_version_id`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_quarantines` (
  `run_id` text NOT NULL,
  `source_version_id` text NOT NULL,
  `source_document_id` text NOT NULL,
  `instrument_id` text NOT NULL,
  `official_expression_id` text NOT NULL,
  `text_revision_id` text NOT NULL,
  `publisher_revision_token` text NOT NULL,
  `legacy_target_publisher_revision_token` text NOT NULL,
  `source_publisher_revision_token` text NOT NULL,
  `identity_stage` text NOT NULL,
  `language` text NOT NULL,
  `script` text NOT NULL,
  `version_source_url` text,
  `canonical_source_url` text,
  `previous_source_version_id` text,
  `source_change_type` text NOT NULL,
  `source_availability_status` text NOT NULL,
  `source_revision_sha256` text NOT NULL,
  `raw_source_r2_key` text NOT NULL,
  `raw_source_sha256` text NOT NULL,
  `normalized_source_r2_key` text NOT NULL,
  `normalized_source_sha256` text NOT NULL,
  `raw_object_r2_key` text NOT NULL,
  `normalized_object_r2_key` text NOT NULL,
  `reason` text NOT NULL,
  `row_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`source_version_id`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_complete_corpus_quarantine_reason_check` CHECK (`reason`='NO_MATERIALIZED_PROVISIONS'),
  CONSTRAINT `legal_complete_corpus_quarantine_identity_stage_check` CHECK (`identity_stage`='ticket29-provisional-v1')
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_quarantine_attempts` (
  `run_id` text NOT NULL,
  `attempt_id` text NOT NULL,
  `record_count` integer NOT NULL,
  `created_object_count` integer NOT NULL,
  `reused_object_count` integer NOT NULL,
  `created_byte_count` integer NOT NULL,
  `reused_byte_count` integer NOT NULL,
  `root_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`attempt_id`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_interruptions` (
  `run_id` text NOT NULL,
  `page_sha256` text NOT NULL,
  `checkpoint` text NOT NULL,
  `record_count` integer NOT NULL,
  `created_object_count` integer NOT NULL,
  `reused_object_count` integer NOT NULL,
  `created_byte_count` integer NOT NULL,
  `reused_byte_count` integer NOT NULL,
  `recorded_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`page_sha256`,`checkpoint`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_complete_corpus_interruption_checkpoint_check` CHECK (`checkpoint`='objects_durable_before_receipt')
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_pages` (
  `run_id` text NOT NULL,
  `page_sha256` text NOT NULL,
  `plan_offset` integer NOT NULL,
  `plan_length` integer NOT NULL,
  `plan_r2_key` text NOT NULL,
  `record_count` integer NOT NULL,
  `created_object_count` integer NOT NULL,
  `reused_object_count` integer NOT NULL,
  `created_byte_count` integer NOT NULL,
  `reused_byte_count` integer NOT NULL,
  `receipt_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`page_sha256`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_attempt_pages` (
  `run_id` text NOT NULL,
  `attempt_id` text NOT NULL,
  `page_sha256` text NOT NULL,
  `record_count` integer NOT NULL,
  `created_object_count` integer NOT NULL,
  `reused_object_count` integer NOT NULL,
  `created_byte_count` integer NOT NULL,
  `reused_byte_count` integer NOT NULL,
  `receipt_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`attempt_id`,`page_sha256`),
  FOREIGN KEY (`run_id`,`page_sha256`) REFERENCES `legal_complete_corpus_pages`(`run_id`,`page_sha256`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_manifests` (
  `run_id` text NOT NULL,
  `membership` text NOT NULL,
  `record_count` integer NOT NULL,
  `root_sha256` text NOT NULL,
  `r2_key` text NOT NULL,
  `manifest_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`membership`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_complete_corpus_manifest_membership_check` CHECK (`membership` IN ('union','current','history','gaps','quarantines'))
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_lane_reports` (
  `run_id` text NOT NULL,
  `report_kind` text NOT NULL,
  `lane` text NOT NULL,
  `record_count` integer NOT NULL,
  `current_count` integer NOT NULL,
  `history_count` integer NOT NULL,
  `gap_count` integer NOT NULL,
  `verified_object_count` integer NOT NULL,
  `root_sha256` text NOT NULL,
  `r2_key` text NOT NULL,
  `report_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`report_kind`,`lane`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_complete_corpus_lane_report_kind_check` CHECK (`report_kind` IN ('plan','manifest','reconstruction'))
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_control_attempts` (
  `run_id` text NOT NULL,
  `attempt_id` text NOT NULL,
  `stage` text NOT NULL,
  `lane` text NOT NULL,
  `record_count` integer NOT NULL,
  `created_object_count` integer NOT NULL,
  `reused_object_count` integer NOT NULL,
  `created_byte_count` integer NOT NULL,
  `reused_byte_count` integer NOT NULL,
  `root_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`attempt_id`,`stage`,`lane`),
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_complete_corpus_control_attempt_id_check` CHECK (`attempt_id` IN ('ticket29:first','ticket29:second')),
  CONSTRAINT `legal_complete_corpus_control_stage_check` CHECK (`stage` IN ('plan','manifest','reconstruction','finalize')),
  CONSTRAINT `legal_complete_corpus_control_count_check` CHECK (
    `record_count`>=0 AND `created_object_count`>=0 AND `reused_object_count`>=0
    AND `created_byte_count`>=0 AND `reused_byte_count`>=0
  )
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_qualifications` (
  `run_id` text NOT NULL PRIMARY KEY,
  `report_r2_key` text NOT NULL,
  `report_sha256` text NOT NULL,
  `report_byte_count` integer NOT NULL,
  `report_write_disposition` text NOT NULL,
  `database_export_sha256` text NOT NULL,
  `database_export_byte_count` integer NOT NULL,
  `evidence_object_count` integer NOT NULL,
  `evidence_byte_count` integer NOT NULL,
  `evidence_root_sha256` text NOT NULL,
  `qualified_at` text NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_complete_corpus_qualification_disposition_check` CHECK (`report_write_disposition` IN ('created','reused')),
  CONSTRAINT `legal_complete_corpus_qualification_count_check` CHECK (
    `report_byte_count`>=0 AND `database_export_byte_count`>=0
    AND `evidence_object_count`>=0 AND `evidence_byte_count`>=0
  )
);
--> statement-breakpoint
CREATE TABLE `legal_complete_corpus_snapshots` (
  `run_id` text NOT NULL PRIMARY KEY,
  `snapshot_id` text NOT NULL UNIQUE,
  `source_cutoff` text NOT NULL,
  `source_inventory_sha256` text NOT NULL,
  `source_canonical_sha256` text NOT NULL,
  `source_alias_sha256` text NOT NULL,
  `union_root_sha256` text NOT NULL,
  `current_root_sha256` text NOT NULL,
  `history_root_sha256` text NOT NULL,
  `gaps_root_sha256` text NOT NULL,
  `quarantines_root_sha256` text NOT NULL,
  `r2_key` text NOT NULL UNIQUE,
  `snapshot_sha256` text NOT NULL,
  `byte_count` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_snapshots_building_insert` BEFORE INSERT ON `legal_complete_corpus_snapshots`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_snapshots_no_update` BEFORE UPDATE ON `legal_complete_corpus_snapshots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_snapshots_no_delete` BEFORE DELETE ON `legal_complete_corpus_snapshots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_qualifications_materialized_insert` BEFORE INSERT ON `legal_complete_corpus_qualifications`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'materialized'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUALIFICATION_REQUIRES_MATERIALIZED_RUN'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_qualifications_no_update` BEFORE UPDATE ON `legal_complete_corpus_qualifications`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUALIFICATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_qualifications_no_delete` BEFORE DELETE ON `legal_complete_corpus_qualifications`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUALIFICATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_records_no_update` BEFORE UPDATE ON `legal_complete_corpus_records`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_records_no_delete` BEFORE DELETE ON `legal_complete_corpus_records`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_runs_no_delete` BEFORE DELETE ON `legal_complete_corpus_runs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_aliases_no_update` BEFORE UPDATE ON `legal_complete_corpus_aliases`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_ALIAS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_aliases_no_delete` BEFORE DELETE ON `legal_complete_corpus_aliases`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_ALIAS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_lineage_refs_no_update` BEFORE UPDATE ON `legal_complete_corpus_lineage_refs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_LINEAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_lineage_refs_no_delete` BEFORE DELETE ON `legal_complete_corpus_lineage_refs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_LINEAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_quarantines_no_update` BEFORE UPDATE ON `legal_complete_corpus_quarantines`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUARANTINE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_quarantines_no_delete` BEFORE DELETE ON `legal_complete_corpus_quarantines`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUARANTINE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_quarantine_attempts_no_update` BEFORE UPDATE ON `legal_complete_corpus_quarantine_attempts`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUARANTINE_ATTEMPT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_quarantine_attempts_no_delete` BEFORE DELETE ON `legal_complete_corpus_quarantine_attempts`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_QUARANTINE_ATTEMPT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_objects_no_update` BEFORE UPDATE ON `legal_complete_corpus_objects`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_OBJECT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_objects_no_delete` BEFORE DELETE ON `legal_complete_corpus_objects`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_OBJECT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_pages_no_update` BEFORE UPDATE ON `legal_complete_corpus_pages`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_PAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_pages_no_delete` BEFORE DELETE ON `legal_complete_corpus_pages`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_PAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_attempt_pages_no_update` BEFORE UPDATE ON `legal_complete_corpus_attempt_pages`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_ATTEMPT_PAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_attempt_pages_no_delete` BEFORE DELETE ON `legal_complete_corpus_attempt_pages`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_ATTEMPT_PAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_interruptions_no_update` BEFORE UPDATE ON `legal_complete_corpus_interruptions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_INTERRUPTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_interruptions_no_delete` BEFORE DELETE ON `legal_complete_corpus_interruptions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_INTERRUPTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_manifests_no_update` BEFORE UPDATE ON `legal_complete_corpus_manifests`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_manifests_no_delete` BEFORE DELETE ON `legal_complete_corpus_manifests`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_MANIFEST_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_lane_reports_no_update` BEFORE UPDATE ON `legal_complete_corpus_lane_reports`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_LANE_REPORT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_lane_reports_no_delete` BEFORE DELETE ON `legal_complete_corpus_lane_reports`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_LANE_REPORT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_control_attempts_building_insert` BEFORE INSERT ON `legal_complete_corpus_control_attempts`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_control_attempts_no_update` BEFORE UPDATE ON `legal_complete_corpus_control_attempts`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_CONTROL_ATTEMPT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_control_attempts_no_delete` BEFORE DELETE ON `legal_complete_corpus_control_attempts`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_CONTROL_ATTEMPT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_runs_forward_status` BEFORE UPDATE OF `status` ON `legal_complete_corpus_runs`
WHEN NOT (
  (OLD.`status`='building' AND NEW.`status` IN ('building','materialized','failed'))
  OR (OLD.`status`='materialized' AND NEW.`status` IN ('materialized','complete','failed'))
  OR (OLD.`status`='complete' AND NEW.`status`='complete')
  OR (OLD.`status`='failed' AND NEW.`status`='failed')
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_STATUS_REGRESSION'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_runs_immutable_identity` BEFORE UPDATE ON `legal_complete_corpus_runs`
WHEN OLD.`id` IS NOT NEW.`id`
  OR OLD.`schema_version` IS NOT NEW.`schema_version`
  OR OLD.`source_cutoff` IS NOT NEW.`source_cutoff`
  OR OLD.`source_bookmark` IS NOT NEW.`source_bookmark`
  OR OLD.`source_inventory_sha256` IS NOT NEW.`source_inventory_sha256`
  OR OLD.`source_canonical_sha256` IS NOT NEW.`source_canonical_sha256`
  OR OLD.`source_alias_sha256` IS NOT NEW.`source_alias_sha256`
  OR OLD.`source_r2_object_manifest_sha256` IS NOT NEW.`source_r2_object_manifest_sha256`
  OR OLD.`source_r2_alias_manifest_sha256` IS NOT NEW.`source_r2_alias_manifest_sha256`
  OR OLD.`source_empty_version_manifest_sha256` IS NOT NEW.`source_empty_version_manifest_sha256`
  OR OLD.`expected_record_count` IS NOT NEW.`expected_record_count`
  OR (OLD.`plan_r2_key` IS NOT NULL AND OLD.`plan_r2_key` IS NOT NEW.`plan_r2_key`)
  OR (OLD.`plan_sha256` IS NOT NULL AND OLD.`plan_sha256` IS NOT NEW.`plan_sha256`)
  OR (OLD.`final_reconstruction_r2_key` IS NOT NULL
    AND OLD.`final_reconstruction_r2_key` IS NOT NEW.`final_reconstruction_r2_key`)
  OR (OLD.`final_reconstruction_sha256` IS NOT NULL
    AND OLD.`final_reconstruction_sha256` IS NOT NEW.`final_reconstruction_sha256`)
  OR (OLD.`status`='building' AND (NEW.`materialized_record_count`<OLD.`materialized_record_count`
    OR NEW.`materialized_record_count`>NEW.`expected_record_count`))
  OR (OLD.`status`<>'building'
    AND OLD.`materialized_record_count` IS NOT NEW.`materialized_record_count`)
  OR (OLD.`completed_at` IS NOT NULL AND OLD.`completed_at` IS NOT NEW.`completed_at`)
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_objects_building_insert` BEFORE INSERT ON `legal_complete_corpus_objects`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_records_building_insert` BEFORE INSERT ON `legal_complete_corpus_records`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_aliases_building_insert` BEFORE INSERT ON `legal_complete_corpus_aliases`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_lineage_refs_building_insert` BEFORE INSERT ON `legal_complete_corpus_lineage_refs`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_quarantines_building_insert` BEFORE INSERT ON `legal_complete_corpus_quarantines`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_quarantine_attempts_building_insert` BEFORE INSERT ON `legal_complete_corpus_quarantine_attempts`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_interruptions_building_insert` BEFORE INSERT ON `legal_complete_corpus_interruptions`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_pages_building_insert` BEFORE INSERT ON `legal_complete_corpus_pages`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_attempt_pages_building_insert` BEFORE INSERT ON `legal_complete_corpus_attempt_pages`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_manifests_building_insert` BEFORE INSERT ON `legal_complete_corpus_manifests`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_complete_corpus_lane_reports_building_insert` BEFORE INSERT ON `legal_complete_corpus_lane_reports`
WHEN (SELECT `status` FROM `legal_complete_corpus_runs` WHERE `id`=NEW.`run_id`) <> 'building'
BEGIN SELECT RAISE(ABORT, 'LEGAL_COMPLETE_CORPUS_RUN_SEALED'); END;
