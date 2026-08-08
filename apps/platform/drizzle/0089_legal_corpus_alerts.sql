-- Migration 0089: content-free, idempotent legal-corpus operational alerts.
CREATE TABLE `legal_corpus_alert_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_sync_run_id` text,
	`alert_type` text NOT NULL,
	`alert_key` text NOT NULL,
	`severity` text NOT NULL,
	`reason` text NOT NULL,
	`observed_value` integer,
	`threshold_value` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_sync_run_id`) REFERENCES `source_sync_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `legal_corpus_alert_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `legal_corpus_alert_source_check` CHECK (`source_kind` IN ('lex','advice')),
	CONSTRAINT `legal_corpus_alert_type_check` CHECK (`alert_type` IN ('legal_corpus_sync_failed','legal_corpus_stale')),
	CONSTRAINT `legal_corpus_alert_key_check` CHECK (length(`alert_key`) BETWEEN 1 AND 160 AND `alert_key` NOT GLOB '*[^A-Za-z0-9:_-]*'),
	CONSTRAINT `legal_corpus_alert_severity_check` CHECK (`severity` IN ('warning','critical')),
	CONSTRAINT `legal_corpus_alert_reason_check` CHECK (`reason` IN ('run_failed','never_succeeded','stale_success')),
	CONSTRAINT `legal_corpus_alert_values_check` CHECK (
		(`alert_type`='legal_corpus_sync_failed' AND `severity`='critical' AND `reason`='run_failed' AND `source_sync_run_id` IS NOT NULL AND `observed_value` IS NULL AND `threshold_value` IS NULL)
		OR
		(`alert_type`='legal_corpus_stale' AND `severity`='warning' AND `reason` IN ('never_succeeded','stale_success') AND `observed_value`>=0 AND `threshold_value`>0)
	),
	CONSTRAINT `legal_corpus_alert_status_check` CHECK (`status` IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT `legal_corpus_alert_attempts_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `legal_corpus_alert_delivery_check` CHECK (
		(`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NULL)
		OR (`status` IN ('retrying','failed') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NOT NULL)
		OR (`status`='sent' AND `provider_message_id` IS NOT NULL AND `sent_at` IS NOT NULL AND `error_code` IS NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_alert_epoch_uidx`
ON `legal_corpus_alert_jobs` (`environment`,`source_kind`,`alert_type`,`alert_key`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_alert_status_idx`
ON `legal_corpus_alert_jobs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_alert_run_guard`
BEFORE INSERT ON `legal_corpus_alert_jobs`
WHEN NEW.`source_sync_run_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `source_sync_runs` run
	WHERE run.`id`=NEW.`source_sync_run_id`
	  AND run.`environment`=NEW.`environment`
	  AND run.`source_kind`=NEW.`source_kind`
	  AND run.`run_type` IN ('scheduled_corpus','manual_corpus')
	  AND run.`status`='failed'
)
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_CORPUS_ALERT_RUN_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_alert_identity_guard`
BEFORE UPDATE ON `legal_corpus_alert_jobs`
WHEN NEW.`environment`<>OLD.`environment`
	OR NEW.`source_kind`<>OLD.`source_kind`
	OR coalesce(NEW.`source_sync_run_id`,'')<>coalesce(OLD.`source_sync_run_id`,'')
	OR NEW.`alert_type`<>OLD.`alert_type`
	OR NEW.`alert_key`<>OLD.`alert_key`
	OR NEW.`severity`<>OLD.`severity`
	OR NEW.`reason`<>OLD.`reason`
	OR coalesce(NEW.`observed_value`,-1)<>coalesce(OLD.`observed_value`,-1)
	OR coalesce(NEW.`threshold_value`,-1)<>coalesce(OLD.`threshold_value`,-1)
	OR NEW.`created_at`<>OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_CORPUS_ALERT_IDENTITY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_alert_no_delete`
BEFORE DELETE ON `legal_corpus_alert_jobs`
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_CORPUS_ALERT_IMMUTABLE');
END;
