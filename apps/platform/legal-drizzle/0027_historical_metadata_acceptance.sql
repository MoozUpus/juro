CREATE TABLE `legal_historical_metadata_acceptances` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL CHECK (`environment` IN ('development','staging','production')),
  `catalog_database_id` text NOT NULL,
  `complete_corpus_run_id` text NOT NULL UNIQUE,
  `history_root_sha256` text NOT NULL CHECK (
    length(`history_root_sha256`)=64 AND `history_root_sha256` NOT GLOB '*[^0-9a-f]*'),
  `history_record_count` integer NOT NULL CHECK (`history_record_count`>0),
  `gap_record_count` integer NOT NULL CHECK (`gap_record_count`>=0),
  `alias_count` integer NOT NULL CHECK (`alias_count`>=0),
  `lineage_ref_count` integer NOT NULL CHECK (`lineage_ref_count`>=0),
  `active_activation_set_id` text NOT NULL,
  `active_current_release_id` text NOT NULL,
  `waiver_id` text NOT NULL,
  `new_historical_record_count` integer NOT NULL CHECK (`new_historical_record_count`=0),
  `new_evidence_object_count` integer NOT NULL CHECK (`new_evidence_object_count`=0),
  `result_r2_key` text NOT NULL UNIQUE,
  `result_sha256` text NOT NULL CHECK (
    length(`result_sha256`)=64 AND `result_sha256` NOT GLOB '*[^0-9a-f]*'),
  `accepted_at` text NOT NULL,
  FOREIGN KEY (`complete_corpus_run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  FOREIGN KEY (`active_activation_set_id`) REFERENCES `legal_activation_sets`(`id`) ON DELETE restrict,
  FOREIGN KEY (`active_current_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TRIGGER `legal_historical_metadata_acceptances_insert_guard`
BEFORE INSERT ON `legal_historical_metadata_acceptances`
WHEN EXISTS (SELECT 1 FROM `legal_historical_metadata_acceptances`
  WHERE `complete_corpus_run_id`=NEW.`complete_corpus_run_id`
    OR `id`=NEW.`id` OR `result_r2_key`=NEW.`result_r2_key`)
BEGIN SELECT RAISE(ABORT, 'LEGAL_HISTORICAL_METADATA_ACCEPTANCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_historical_metadata_acceptances_no_update`
BEFORE UPDATE ON `legal_historical_metadata_acceptances`
BEGIN SELECT RAISE(ABORT, 'LEGAL_HISTORICAL_METADATA_ACCEPTANCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_historical_metadata_acceptances_no_delete`
BEFORE DELETE ON `legal_historical_metadata_acceptances`
BEGIN SELECT RAISE(ABORT, 'LEGAL_HISTORICAL_METADATA_ACCEPTANCE_IMMUTABLE'); END;
