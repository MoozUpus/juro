-- A durable cross-shard acquisition fence. The singleton starts active so the
-- migration is behavior-preserving; a rollover utility must move it to
-- handoff_prepared only after proving that no live scheduler/job lease exists.
CREATE TABLE `legal_corpus_shard_control` (
  `singleton_id` integer PRIMARY KEY NOT NULL DEFAULT 1,
  `acquisition_state` text NOT NULL DEFAULT 'active',
  `active_handoff_id` text,
  `target_database_name` text,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_corpus_shard_control_singleton_check` CHECK (`singleton_id`=1),
  CONSTRAINT `legal_corpus_shard_control_state_check` CHECK (`acquisition_state` IN ('active','handoff_prepared','frozen')),
  CONSTRAINT `legal_corpus_shard_control_handoff_check` CHECK (
    (`acquisition_state`='active' AND `active_handoff_id` IS NULL AND `target_database_name` IS NULL)
    OR (`acquisition_state` IN ('handoff_prepared','frozen') AND length(`active_handoff_id`)>0
      AND `target_database_name` LIKE 'juro-staging-corpus-shard-%')
  )
);
--> statement-breakpoint
INSERT INTO `legal_corpus_shard_control`
  (`singleton_id`,`acquisition_state`,`active_handoff_id`,`target_database_name`,`updated_at`)
VALUES (1,'active',NULL,NULL,'1970-01-01T00:00:00.000Z');
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_control_no_delete`
BEFORE DELETE ON `legal_corpus_shard_control`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_CONTROL_DELETE_FORBIDDEN');
END;
--> statement-breakpoint
-- Keep the fence effective even if the Worker deployment is rolled back to a
-- version that predates the control-row checks. A prepared/frozen shard may
-- not acquire the corpus scheduler lease or start a new corpus run.
CREATE TRIGGER `legal_corpus_shard_scheduler_lock_insert_guard`
BEFORE INSERT ON `scheduled_locks`
FOR EACH ROW WHEN NEW.`name`='legal-corpus-worker' AND NOT EXISTS (
  SELECT 1 FROM `legal_corpus_shard_control`
  WHERE `singleton_id`=1 AND `acquisition_state`='active'
)
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_scheduler_lock_update_guard`
BEFORE UPDATE ON `scheduled_locks`
FOR EACH ROW WHEN NEW.`name`='legal-corpus-worker' AND NOT EXISTS (
  SELECT 1 FROM `legal_corpus_shard_control`
  WHERE `singleton_id`=1 AND `acquisition_state`='active'
)
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_scheduled_run_insert_guard`
BEFORE INSERT ON `scheduled_runs`
FOR EACH ROW WHEN NEW.`schedule_name`='legal-corpus-worker' AND NEW.`status`='running'
  AND NOT EXISTS (
    SELECT 1 FROM `legal_corpus_shard_control`
    WHERE `singleton_id`=1 AND `acquisition_state`='active'
  )
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_scheduled_run_update_guard`
BEFORE UPDATE OF `status` ON `scheduled_runs`
FOR EACH ROW WHEN NEW.`schedule_name`='legal-corpus-worker' AND NEW.`status`='running'
  AND OLD.`status`<>'running' AND NOT EXISTS (
    SELECT 1 FROM `legal_corpus_shard_control`
    WHERE `singleton_id`=1 AND `acquisition_state`='active'
  )
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_ingestion_reactivation_guard`
BEFORE UPDATE OF `status` ON `legal_corpus_ingestion_jobs`
FOR EACH ROW WHEN NEW.`status` IN ('queued','retrying','running') AND NOT EXISTS (
  SELECT 1 FROM `legal_corpus_shard_control`
  WHERE `singleton_id`=1 AND `acquisition_state`='active'
)
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN');
END;
--> statement-breakpoint
CREATE TABLE `legal_corpus_shard_handoffs` (
  `id` text PRIMARY KEY NOT NULL,
  `source_database_name` text NOT NULL,
  `target_database_name` text NOT NULL,
  `manifest_sha256` text NOT NULL,
  `checkpoint_count` integer NOT NULL,
  `discovery_document_count` integer NOT NULL,
  `active_job_count` integer NOT NULL,
  `document_affinity_job_count` integer NOT NULL,
  `failure_count` integer NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_corpus_shard_handoff_database_check` CHECK (
    `source_database_name` LIKE 'juro-staging-corpus-shard-%'
    AND `target_database_name` LIKE 'juro-staging-corpus-shard-%'
    AND `source_database_name`<>`target_database_name`
  ),
  CONSTRAINT `legal_corpus_shard_handoff_hash_check` CHECK (
    length(`manifest_sha256`)=64 AND `manifest_sha256` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `legal_corpus_shard_handoff_count_check` CHECK (
    `checkpoint_count`>=0 AND `discovery_document_count`>=0
    AND `active_job_count`>=0 AND `document_affinity_job_count`=0
    AND `failure_count`>=0
  )
);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoff_document_affinity_guard`
BEFORE INSERT ON `legal_corpus_shard_handoffs`
FOR EACH ROW WHEN EXISTS (
  SELECT 1 FROM `legal_corpus_ingestion_jobs` AS job
  INNER JOIN `legal_corpus_documents` AS document
    ON document.`id`=job.`canonical_document_id`
  WHERE job.`status` IN ('queued','retrying','running') AND job.`handoff_id` IS NULL
)
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_DOCUMENT_AFFINITY_PENDING');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoffs_no_update`
BEFORE UPDATE ON `legal_corpus_shard_handoffs`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_HANDOFF_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoffs_no_delete`
BEFORE DELETE ON `legal_corpus_shard_handoffs`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_HANDOFF_DELETE_FORBIDDEN');
END;
--> statement-breakpoint
CREATE TABLE `legal_corpus_shard_handoff_events` (
  `id` text PRIMARY KEY NOT NULL,
  `handoff_id` text NOT NULL,
  `event_type` text NOT NULL,
  `event_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`handoff_id`) REFERENCES `legal_corpus_shard_handoffs`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_shard_handoff_event_type_check` CHECK (`event_type` IN ('prepared','target_seeded','committed','activated','rollback_blocked')),
  CONSTRAINT `legal_corpus_shard_handoff_event_hash_check` CHECK (
    length(`event_sha256`)=64 AND `event_sha256` NOT GLOB '*[^0-9a-f]*'
  )
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_shard_handoff_events_idx`
ON `legal_corpus_shard_handoff_events` (`handoff_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoff_events_no_update`
BEFORE UPDATE ON `legal_corpus_shard_handoff_events`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_HANDOFF_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoff_events_no_delete`
BEFORE DELETE ON `legal_corpus_shard_handoff_events`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_HANDOFF_EVENT_DELETE_FORBIDDEN');
END;
--> statement-breakpoint
ALTER TABLE `legal_corpus_ingestion_jobs` ADD COLUMN `handoff_id` text;
--> statement-breakpoint
ALTER TABLE `legal_corpus_ingestion_jobs` ADD COLUMN `handoff_target_database_name` text;
--> statement-breakpoint
ALTER TABLE `legal_corpus_ingestion_jobs` ADD COLUMN `handed_off_at` text;
--> statement-breakpoint
CREATE TABLE `legal_corpus_shard_handoff_jobs` (
  `handoff_id` text NOT NULL,
  `job_id` text NOT NULL,
  `source_status` text NOT NULL,
  `source_attempt_count` integer NOT NULL,
  `source_max_attempts` integer NOT NULL,
  `source_next_attempt_at` text,
  `source_last_error_code` text,
  `source_updated_at` text NOT NULL,
  `job_sha256` text NOT NULL,
  PRIMARY KEY (`handoff_id`,`job_id`),
  FOREIGN KEY (`handoff_id`) REFERENCES `legal_corpus_shard_handoffs`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`job_id`) REFERENCES `legal_corpus_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_shard_handoff_job_status_check` CHECK (`source_status` IN ('queued','retrying')),
  CONSTRAINT `legal_corpus_shard_handoff_job_attempt_check` CHECK (
    `source_attempt_count`>=0 AND `source_max_attempts` BETWEEN 1 AND 12
  ),
  CONSTRAINT `legal_corpus_shard_handoff_job_hash_check` CHECK (
    length(`job_sha256`)=64 AND `job_sha256` NOT GLOB '*[^0-9a-f]*'
  )
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_shard_handoff_jobs_job_idx`
ON `legal_corpus_shard_handoff_jobs` (`job_id`,`handoff_id`);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoff_jobs_no_update`
BEFORE UPDATE ON `legal_corpus_shard_handoff_jobs`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_HANDOFF_JOB_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_handoff_jobs_no_delete`
BEFORE DELETE ON `legal_corpus_shard_handoff_jobs`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_HANDOFF_JOB_DELETE_FORBIDDEN');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_ingestion_job_handoff_insert_guard`
BEFORE INSERT ON `legal_corpus_ingestion_jobs`
FOR EACH ROW WHEN
  (NEW.`handoff_id` IS NULL AND (NEW.`handoff_target_database_name` IS NOT NULL OR NEW.`handed_off_at` IS NOT NULL))
  OR (NEW.`handoff_id` IS NOT NULL AND (
    NEW.`handoff_target_database_name` IS NULL OR NEW.`handed_off_at` IS NULL
    OR NEW.`status`<>'completed' OR NEW.`next_attempt_at` IS NOT NULL
    OR NEW.`last_error_code`<>'LEGAL_CORPUS_SHARD_HANDOFF'
  ))
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_INGESTION_HANDOFF_STATE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_shard_ingestion_affinity_insert_guard`
BEFORE INSERT ON `legal_corpus_ingestion_jobs`
FOR EACH ROW WHEN NEW.`status` IN ('queued','retrying','running')
  AND NEW.`canonical_document_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `legal_corpus_shard_control`
    WHERE `singleton_id`=1 AND `acquisition_state`='active'
  )
  AND EXISTS (
    SELECT 1 FROM `legal_corpus_documents`
    WHERE `id`=NEW.`canonical_document_id`
  )
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_SHARD_DOCUMENT_AFFINITY_PENDING');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_ingestion_job_handoff_update_guard`
BEFORE UPDATE ON `legal_corpus_ingestion_jobs`
FOR EACH ROW WHEN
  (OLD.`handoff_id` IS NOT NULL)
  OR (NEW.`handoff_id` IS NULL AND (NEW.`handoff_target_database_name` IS NOT NULL OR NEW.`handed_off_at` IS NOT NULL))
  OR (NEW.`handoff_id` IS NOT NULL AND (
    NEW.`handoff_target_database_name` IS NULL OR NEW.`handed_off_at` IS NULL
    OR NEW.`status`<>'completed' OR NEW.`next_attempt_at` IS NOT NULL
    OR NEW.`last_error_code`<>'LEGAL_CORPUS_SHARD_HANDOFF'
  ))
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_INGESTION_HANDOFF_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_ingestion_job_handoff_no_delete`
BEFORE DELETE ON `legal_corpus_ingestion_jobs`
FOR EACH ROW WHEN OLD.`handoff_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'LEGAL_CORPUS_INGESTION_HANDOFF_DELETE_FORBIDDEN');
END;
