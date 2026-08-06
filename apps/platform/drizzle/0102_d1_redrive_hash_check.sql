-- Migration 0102: replace the D1-incompatible exact-length GLOB hash checks.
-- Preserve the append-only redrive history while using a simple character-class
-- check that Cloudflare D1 accepts at write time.
DROP TRIGGER IF EXISTS `operational_job_redrive_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `operational_job_redrive_no_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `operational_job_redrive_apply`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `operational_job_redrive_projection_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `operational_job_redrive_sequence_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `operational_job_redrive_actor_guard`;--> statement-breakpoint
CREATE TABLE `operational_job_redrive_events__0102` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`source_job_id` text NOT NULL,
	`outbox_id` text NOT NULL,
	`version` integer NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`previous_job_status` text NOT NULL,
	`previous_outbox_status` text NOT NULL,
	`previous_error_code` text,
	`previous_attempt` integer NOT NULL,
	`previous_dispatched_at` text,
	`previous_event_hash` text,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_job_id`) REFERENCES `job_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`outbox_id`) REFERENCES `job_outbox`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `operational_job_redrive_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `operational_job_redrive_version_check` CHECK (`version` > 0),
	CONSTRAINT `operational_job_redrive_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
	CONSTRAINT `operational_job_redrive_job_status_check` CHECK (`previous_job_status` IN ('retrying','rejected','dead_lettered')),
	CONSTRAINT `operational_job_redrive_outbox_status_check` CHECK (`previous_outbox_status` IN ('dispatched','retrying','rejected')),
	CONSTRAINT `operational_job_redrive_attempt_check` CHECK (`previous_attempt` > 0),
	CONSTRAINT `operational_job_redrive_previous_hash_check` CHECK (`previous_event_hash` IS NULL OR (length(`previous_event_hash`)=64 AND `previous_event_hash` NOT GLOB '*[^A-F0-9]*')),
	CONSTRAINT `operational_job_redrive_event_hash_check` CHECK (length(`event_hash`)=64 AND `event_hash` NOT GLOB '*[^A-F0-9]*')
);--> statement-breakpoint
INSERT INTO `operational_job_redrive_events__0102` SELECT * FROM `operational_job_redrive_events`;--> statement-breakpoint
DROP TABLE `operational_job_redrive_events`;--> statement-breakpoint
ALTER TABLE `operational_job_redrive_events__0102` RENAME TO `operational_job_redrive_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `operational_job_redrive_source_version_uidx` ON `operational_job_redrive_events` (`source_job_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `operational_job_redrive_event_hash_uidx` ON `operational_job_redrive_events` (`event_hash`);--> statement-breakpoint
CREATE INDEX `operational_job_redrive_environment_created_idx` ON `operational_job_redrive_events` (`environment`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_actor_guard` BEFORE INSERT ON `operational_job_redrive_events` WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`actor_user_id`) BEGIN SELECT RAISE(ABORT, 'OPERATIONAL_JOB_REDRIVE_ACTOR_UNAVAILABLE'); END;--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_sequence_guard` BEFORE INSERT ON `operational_job_redrive_events` WHEN NEW.`version` <> COALESCE((SELECT MAX(`version`) + 1 FROM `operational_job_redrive_events` WHERE `source_job_id`=NEW.`source_job_id`), 1) OR COALESCE(NEW.`previous_event_hash`,'') <> COALESCE((SELECT `event_hash` FROM `operational_job_redrive_events` WHERE `source_job_id`=NEW.`source_job_id` ORDER BY `version` DESC LIMIT 1),'') BEGIN SELECT RAISE(ABORT, 'OPERATIONAL_JOB_REDRIVE_SEQUENCE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_projection_guard` BEFORE INSERT ON `operational_job_redrive_events` WHEN NOT EXISTS (SELECT 1 FROM `job_runs` AS j JOIN `job_outbox` AS o ON o.`id`=NEW.`outbox_id` AND o.`idempotency_key`=j.`idempotency_key` WHERE j.`id`=NEW.`source_job_id` AND j.`queue_name` LIKE NEW.`environment` || '-%' AND j.`status`=NEW.`previous_job_status` AND o.`status`=NEW.`previous_outbox_status` AND j.`job_type`=o.`job_type` AND j.`subject_id`=o.`subject_id` AND COALESCE(j.`workspace_id`,'')=COALESCE(o.`workspace_id`,'') AND j.`correlation_id`=o.`correlation_id` AND COALESCE(j.`error_code`,'')=COALESCE(NEW.`previous_error_code`,'') AND j.`attempt`=NEW.`previous_attempt` AND COALESCE(o.`dispatched_at`,'')=COALESCE(NEW.`previous_dispatched_at`,'') AND (j.`lease_expires_at` IS NULL OR j.`lease_expires_at`<=NEW.`created_at`) AND (j.`status`='retrying' OR j.`error_code` IN ('ASYNC_RUNTIME_DISABLED','JOB_SCHEMA_VERSION_MISMATCH','JOB_HANDLER_NOT_ENABLED','JOB_TRANSIENT_FAILURE','JOB_LEASE_LOST','DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE','DOCUMENT_ANALYSIS_PERSISTENCE_FAILED','USER_DOCUMENT_INDEX_FAILED','OCR_PROVIDER_UNAVAILABLE','OCR_PERSISTENCE_FAILED','DOCUMENT_EXPORT_OBJECT_FAILED','EMAIL_CONFIGURATION_UNAVAILABLE','EMAIL_PROVIDER_UNAVAILABLE','OPERATIONAL_ALERT_CONFIGURATION_UNAVAILABLE','OPERATIONAL_ALERT_PROVIDER_UNAVAILABLE','LEGAL_SOURCE_SYNC_FAILED','LEGAL_SOURCE_PARSE_FAILED','LEGAL_SOURCE_INDEX_FAILED','NOTIFICATION_PERSISTENCE_FAILED','MALWARE_SCANNER_UNAVAILABLE','MALWARE_SCAN_OBJECT_FAILED','MALWARE_SCAN_PERSISTENCE_FAILED'))) BEGIN SELECT RAISE(ABORT, 'OPERATIONAL_JOB_REDRIVE_NOT_ALLOWED'); END;--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_apply` AFTER INSERT ON `operational_job_redrive_events` BEGIN UPDATE `job_runs` SET `status`='retrying',`lease_owner`=NULL,`lease_expires_at`=NULL,`next_attempt_at`=NEW.`created_at`,`finished_at`=NULL,`updated_at`=NEW.`created_at` WHERE `id`=NEW.`source_job_id`; UPDATE `job_outbox` SET `status`='pending',`available_at`=NEW.`created_at`,`lease_owner`=NULL,`lease_expires_at`=NULL,`next_attempt_at`=NULL,`dispatched_at`=NULL,`error_code`=NULL,`updated_at`=NEW.`created_at` WHERE `id`=NEW.`outbox_id`; END;--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_no_update` BEFORE UPDATE ON `operational_job_redrive_events` BEGIN SELECT RAISE(ABORT, 'OPERATIONAL_JOB_REDRIVE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_no_delete` BEFORE DELETE ON `operational_job_redrive_events` BEGIN SELECT RAISE(ABORT, 'OPERATIONAL_JOB_REDRIVE_IMMUTABLE'); END;
