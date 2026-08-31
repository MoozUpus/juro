CREATE TABLE `legal_migration_cutoffs` (
  `scope` text PRIMARY KEY NOT NULL,
  `migration_run_id` text NOT NULL UNIQUE,
  `cutoff_at` text NOT NULL,
  `recorded_at` text NOT NULL,
  CONSTRAINT `legal_migration_cutoff_scope_check` CHECK (`scope`='current'),
  CONSTRAINT `legal_migration_cutoff_run_check`
    CHECK (`migration_run_id` GLOB '[a-z0-9]*'
      AND `migration_run_id` NOT GLOB '*[^a-z0-9-]*'
      AND `migration_run_id` NOT GLOB '*--*'
      AND substr(`migration_run_id`,-1,1)<>'-'),
  CONSTRAINT `legal_migration_cutoff_timestamp_check`
    CHECK (`cutoff_at` GLOB '????-??-??T??:??:??*Z'
      AND `recorded_at` GLOB '????-??-??T??:??:??*Z')
);
--> statement-breakpoint
CREATE TRIGGER `legal_migration_cutoffs_no_update`
BEFORE UPDATE ON `legal_migration_cutoffs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_MIGRATION_CUTOFF_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_migration_cutoffs_no_delete`
BEFORE DELETE ON `legal_migration_cutoffs`
BEGIN SELECT RAISE(ABORT, 'LEGAL_MIGRATION_CUTOFF_IMMUTABLE'); END;
