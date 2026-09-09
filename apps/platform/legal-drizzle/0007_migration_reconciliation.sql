CREATE TABLE `legal_source_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `legal_instrument_id` text NOT NULL,
  `source_url` text NOT NULL,
  `redirected_to` text,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`legal_instrument_id`) REFERENCES `legal_instruments`(`id`) ON DELETE restrict,
  UNIQUE (`legal_instrument_id`,`source_url`)
);
--> statement-breakpoint
CREATE TABLE `legal_migration_reconciliation_checkpoints` (
  `run_id` text NOT NULL,
  `phase` text NOT NULL,
  `input_sha256` text NOT NULL,
  `completed_at` text NOT NULL,
  PRIMARY KEY (`run_id`,`phase`),
  CONSTRAINT `legal_migration_checkpoint_phase_check`
    CHECK (`phase` IN ('canonicalized','reconciled'))
);
--> statement-breakpoint
CREATE TABLE `legal_duplicate_candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `semantic_fingerprint` text NOT NULL,
  `canonical_identities_json` text NOT NULL,
  `review_state` text NOT NULL,
  `decision` text,
  `evidence_url` text,
  `reviewed_by` text,
  `reviewed_at` text,
  `recorded_at` text NOT NULL,
  CONSTRAINT `legal_duplicate_candidate_review_check`
    CHECK (`review_state` IN ('unresolved','reviewed')),
  UNIQUE (`run_id`,`semantic_fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `legal_migration_reconciliation_reports` (
  `run_id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `release_id` text NOT NULL,
  `capability` text NOT NULL,
  `input_sha256` text NOT NULL,
  `report_sha256` text NOT NULL UNIQUE,
  `status` text NOT NULL,
  `report_json` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_migration_report_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_migration_report_capability_check`
    CHECK (`capability` IN ('current','history')),
  CONSTRAINT `legal_migration_report_status_check` CHECK (`status` IN ('clean','blocked'))
);
--> statement-breakpoint
CREATE TRIGGER `legal_source_aliases_no_update`
BEFORE UPDATE ON `legal_source_aliases`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_ALIAS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_migration_checkpoints_no_update`
BEFORE UPDATE ON `legal_migration_reconciliation_checkpoints`
BEGIN SELECT RAISE(ABORT, 'LEGAL_MIGRATION_CHECKPOINT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_duplicate_candidates_no_update`
BEFORE UPDATE ON `legal_duplicate_candidates`
BEGIN SELECT RAISE(ABORT, 'LEGAL_DUPLICATE_CANDIDATE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_migration_reports_no_update`
BEFORE UPDATE ON `legal_migration_reconciliation_reports`
BEGIN SELECT RAISE(ABORT, 'LEGAL_MIGRATION_REPORT_IMMUTABLE'); END;
