CREATE TABLE `legal_search_candidate_qualifications` (
  `id` text PRIMARY KEY NOT NULL,
  `search_release_id` text NOT NULL,
  `environment` text NOT NULL,
  `capability` text NOT NULL,
  `reconciliation_run_id` text NOT NULL,
  `provider_namespace` text NOT NULL,
  `provider_instance_id` text NOT NULL,
  `shard_id` text NOT NULL,
  `sync_job_id` text NOT NULL,
  `configuration_json` text NOT NULL,
  `configuration_sha256` text NOT NULL,
  `provider_item_count` integer NOT NULL,
  `provider_chunk_count` integer NOT NULL,
  `provider_inventory_sha256` text NOT NULL,
  `provider_reconciliation_json` text NOT NULL,
  `provider_reconciliation_sha256` text NOT NULL,
  `source_prefix` text NOT NULL,
  `scheduled_indexing_paused` integer NOT NULL,
  `status` text NOT NULL,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`reconciliation_run_id`)
    REFERENCES `legal_migration_reconciliation_reports`(`run_id`) ON DELETE restrict,
  CONSTRAINT `legal_candidate_qualification_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_candidate_qualification_capability_check`
    CHECK (`capability` IN ('current','history')),
  CONSTRAINT `legal_candidate_qualification_shard_check`
    CHECK (length(`shard_id`)=2 AND `shard_id` NOT GLOB '*[^0-9]*'),
  CONSTRAINT `legal_candidate_qualification_hash_check`
    CHECK (length(`configuration_sha256`)=64
      AND `configuration_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`provider_inventory_sha256`)=64
      AND `provider_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`provider_reconciliation_sha256`)=64
      AND `provider_reconciliation_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_candidate_qualification_count_check`
    CHECK (`provider_item_count`>0 AND `provider_chunk_count`>=`provider_item_count`),
  CONSTRAINT `legal_candidate_qualification_pause_check`
    CHECK (`scheduled_indexing_paused`=1),
  CONSTRAINT `legal_candidate_qualification_status_check`
    CHECK (`status`='qualified'),
  UNIQUE (`search_release_id`,`provider_instance_id`,`recorded_at`)
);
--> statement-breakpoint
CREATE INDEX `legal_search_candidate_qualification_release_idx`
ON `legal_search_candidate_qualifications`
  (`search_release_id`,`environment`,`capability`,`recorded_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_search_candidate_qualifications_no_update`
BEFORE UPDATE ON `legal_search_candidate_qualifications`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CANDIDATE_QUALIFICATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_candidate_qualifications_no_delete`
BEFORE DELETE ON `legal_search_candidate_qualifications`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CANDIDATE_QUALIFICATION_IMMUTABLE'); END;
