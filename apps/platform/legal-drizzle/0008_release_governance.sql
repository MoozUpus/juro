CREATE TABLE `legal_search_release_governance` (
  `id` text PRIMARY KEY NOT NULL,
  `search_release_id` text NOT NULL,
  `environment` text NOT NULL,
  `capability` text NOT NULL,
  `reconciliation_run_id` text NOT NULL,
  `status` text NOT NULL,
  `failures_json` text NOT NULL,
  `evidence_json` text NOT NULL,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`reconciliation_run_id`) REFERENCES `legal_migration_reconciliation_reports`(`run_id`) ON DELETE restrict,
  CONSTRAINT `legal_release_governance_status_check` CHECK (`status` IN ('passed','failed')),
  UNIQUE (`search_release_id`,`recorded_at`)
);
--> statement-breakpoint
CREATE TABLE `legal_search_release_shards` (
  `governance_id` text NOT NULL,
  `search_release_id` text NOT NULL,
  `shard_id` text NOT NULL,
  `item_count` integer NOT NULL,
  `inventory_sha256` text NOT NULL,
  `sync_state` text NOT NULL,
  PRIMARY KEY (`governance_id`,`shard_id`),
  FOREIGN KEY (`governance_id`) REFERENCES `legal_search_release_governance`(`id`) ON DELETE restrict,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_release_shard_sync_check` CHECK (`sync_state`='complete'),
  CONSTRAINT `legal_release_shard_count_check` CHECK (`item_count`>=0)
);
--> statement-breakpoint
CREATE TABLE `legal_search_release_evaluation_strata` (
  `governance_id` text NOT NULL,
  `search_release_id` text NOT NULL,
  `stratum` text NOT NULL,
  `scenario_count` integer NOT NULL,
  `metrics_json` text NOT NULL,
  PRIMARY KEY (`governance_id`,`stratum`),
  FOREIGN KEY (`governance_id`) REFERENCES `legal_search_release_governance`(`id`) ON DELETE restrict,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_release_stratum_count_check` CHECK (`scenario_count`>0)
);
--> statement-breakpoint
CREATE TABLE `legal_release_observations` (
  `id` text PRIMARY KEY NOT NULL,
  `release_id` text NOT NULL,
  `environment` text NOT NULL,
  `phase` text NOT NULL,
  `observed_at` text NOT NULL,
  `request_count` integer NOT NULL,
  `green` integer NOT NULL,
  `gate_breach_count` integer NOT NULL,
  CONSTRAINT `legal_release_observation_environment_check`
    CHECK (`environment` IN ('staging','production')),
  CONSTRAINT `legal_release_observation_phase_check`
    CHECK (`phase` IN ('staging_soak','production_canary','retirement_stability')),
  CONSTRAINT `legal_release_observation_count_check`
    CHECK (`request_count`>=0 AND `gate_breach_count`>=0 AND `green` IN (0,1)),
  UNIQUE (`release_id`,`phase`,`observed_at`)
);
--> statement-breakpoint
CREATE INDEX `legal_release_observation_window_idx`
ON `legal_release_observations` (`release_id`,`phase`,`observed_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_search_release_governance_no_update`
BEFORE UPDATE ON `legal_search_release_governance`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RELEASE_GOVERNANCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_release_shards_no_update`
BEFORE UPDATE ON `legal_search_release_shards`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RELEASE_GOVERNANCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_release_evaluation_strata_no_update`
BEFORE UPDATE ON `legal_search_release_evaluation_strata`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RELEASE_GOVERNANCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_release_observations_no_update`
BEFORE UPDATE ON `legal_release_observations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RELEASE_OBSERVATION_IMMUTABLE'); END;
