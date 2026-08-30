ALTER TABLE `legal_search_releases`
ADD COLUMN `sealed_reconciliation_run_id` text
REFERENCES `legal_migration_reconciliation_reports`(`run_id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `legal_search_releases_sealed_reconciliation_idx`
ON `legal_search_releases` (`sealed_reconciliation_run_id`);
