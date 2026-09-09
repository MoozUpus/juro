CREATE TABLE `legal_search_release_provider_instances` (
  `governance_id` text NOT NULL,
  `search_release_id` text NOT NULL,
  `shard_id` text NOT NULL,
  `provider_namespace` text NOT NULL,
  `provider_instance_id` text NOT NULL,
  `sync_job_id` text NOT NULL,
  `scheduled_indexing_paused` integer NOT NULL,
  PRIMARY KEY (`governance_id`,`shard_id`),
  FOREIGN KEY (`governance_id`,`shard_id`)
    REFERENCES `legal_search_release_shards`(`governance_id`,`shard_id`) ON DELETE restrict,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_release_provider_pause_check`
    CHECK (`scheduled_indexing_paused` IN (0,1)),
  UNIQUE (`governance_id`,`provider_instance_id`)
);
--> statement-breakpoint
CREATE INDEX `legal_search_release_provider_instance_lookup_idx`
ON `legal_search_release_provider_instances` (`provider_namespace`,`provider_instance_id`);
--> statement-breakpoint
CREATE TRIGGER `legal_search_release_provider_instances_no_update`
BEFORE UPDATE ON `legal_search_release_provider_instances`
BEGIN SELECT RAISE(ABORT, 'LEGAL_RELEASE_GOVERNANCE_IMMUTABLE'); END;
