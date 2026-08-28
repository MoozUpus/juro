-- Migration 0160: durable, content-minimized legislation-monitor email jobs.
-- Queue envelopes contain only opaque identifiers. Recipient addresses remain
-- inside the protected user identity boundary and are resolved by the consumer.
CREATE TABLE `monitoring_email_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`preference_id` text NOT NULL,
	`notification_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`frequency` text NOT NULL,
	`locale` text NOT NULL,
	`cursor_from` text NOT NULL,
	`cursor_through` text NOT NULL,
	`event_count` integer NOT NULL,
	`official_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`error_code` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`preference_id`) REFERENCES `monitoring_preferences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `monitoring_email_job_id_check` CHECK (`id` GLOB 'monitoring-email:*' AND length(`id`) BETWEEN 32 AND 180),
	CONSTRAINT `monitoring_email_job_frequency_check` CHECK (`frequency` IN ('immediate','daily','weekly')),
	CONSTRAINT `monitoring_email_job_locale_check` CHECK (`locale` IN ('ru','uz')),
	CONSTRAINT `monitoring_email_job_cursor_check` CHECK (`cursor_from` < `cursor_through`),
	CONSTRAINT `monitoring_email_job_event_count_check` CHECK (`event_count` BETWEEN 1 AND 10000),
	CONSTRAINT `monitoring_email_job_url_check` CHECK (
		length(`official_url`) BETWEEN 24 AND 2048
		AND (`official_url` GLOB 'https://lex.uz/*/docs/*' OR `official_url` GLOB 'https://www.lex.uz/*/docs/*')
		AND instr(`official_url`,'?')=0
		AND instr(`official_url`,'#')=0
	),
	CONSTRAINT `monitoring_email_job_status_check` CHECK (`status` IN ('pending','sending','retrying','sent','failed','cancelled')),
	CONSTRAINT `monitoring_email_job_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `monitoring_email_job_evidence_check` CHECK (
		(`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `error_code` IS NULL AND `sent_at` IS NULL)
		OR (`status`='retrying' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
		OR (`status`='sent' AND `provider_message_id` IS NOT NULL AND length(`provider_message_id`) BETWEEN 1 AND 180 AND `error_code` IS NULL AND `sent_at` IS NOT NULL)
		OR (`status`='failed' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
		OR (`status`='cancelled' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_email_jobs_notification_uidx` ON `monitoring_email_jobs` (`notification_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_email_jobs_window_uidx` ON `monitoring_email_jobs` (`preference_id`,`cursor_from`,`cursor_through`);--> statement-breakpoint
CREATE INDEX `monitoring_email_jobs_status_idx` ON `monitoring_email_jobs` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `monitoring_email_jobs_user_idx` ON `monitoring_email_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `monitoring_email_jobs_insert_guard`
BEFORE INSERT ON `monitoring_email_jobs`
WHEN NEW.`status`<>'pending'
	OR NEW.`attempt_count`<>0
	OR NEW.`provider_message_id` IS NOT NULL
	OR NEW.`error_code` IS NOT NULL
	OR NEW.`sent_at` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1
		FROM `monitoring_preferences` preference
		JOIN `notifications` notification
			ON notification.`id`=NEW.`notification_id`
			AND notification.`workspace_id`=preference.`workspace_id`
			AND notification.`user_id`=preference.`user_id`
			AND notification.`type`='legislation_monitor'
		JOIN `workspace_members` member
			ON member.`workspace_id`=preference.`workspace_id`
			AND member.`user_id`=preference.`user_id`
			AND member.`status`='active'
		WHERE preference.`id`=NEW.`preference_id`
			AND preference.`workspace_id`=NEW.`workspace_id`
			AND preference.`user_id`=NEW.`user_id`
			AND preference.`frequency`=NEW.`frequency`
			AND preference.`locale`=NEW.`locale`
			AND preference.`last_delivered_at`=NEW.`cursor_from`
			AND instr(preference.`channels_json`,'"email"')>0
	)
BEGIN
	SELECT RAISE(ABORT,'MONITORING_EMAIL_SOURCE_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `monitoring_email_jobs_identity_immutable`
BEFORE UPDATE ON `monitoring_email_jobs`
WHEN NEW.`id` IS NOT OLD.`id`
	OR NEW.`preference_id` IS NOT OLD.`preference_id`
	OR NEW.`notification_id` IS NOT OLD.`notification_id`
	OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`frequency` IS NOT OLD.`frequency`
	OR NEW.`locale` IS NOT OLD.`locale`
	OR NEW.`cursor_from` IS NOT OLD.`cursor_from`
	OR NEW.`cursor_through` IS NOT OLD.`cursor_through`
	OR NEW.`event_count` IS NOT OLD.`event_count`
	OR NEW.`official_url` IS NOT OLD.`official_url`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'MONITORING_EMAIL_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `monitoring_email_jobs_transition_guard`
BEFORE UPDATE ON `monitoring_email_jobs`
WHEN NOT (
	(OLD.`status` IN ('pending','retrying') AND NEW.`status`='sending'
		AND NEW.`attempt_count`=OLD.`attempt_count`+1
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NULL AND NEW.`sent_at` IS NULL)
	OR (OLD.`status`='sending' AND NEW.`status`='sending'
		AND NEW.`attempt_count`=OLD.`attempt_count`+1
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NULL AND NEW.`sent_at` IS NULL)
	OR (OLD.`status`='sending' AND NEW.`status` IN ('retrying','failed')
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NOT NULL AND NEW.`sent_at` IS NULL)
	OR (OLD.`status`='sending' AND NEW.`status`='sent'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`provider_message_id` IS NOT NULL AND NEW.`error_code` IS NULL AND NEW.`sent_at` IS NOT NULL)
	OR (OLD.`status` IN ('pending','sending','retrying') AND NEW.`status`='cancelled'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NOT NULL AND NEW.`sent_at` IS NULL)
)
BEGIN
	SELECT RAISE(ABORT,'MONITORING_EMAIL_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `monitoring_email_jobs_sent_guard`
BEFORE UPDATE ON `monitoring_email_jobs`
WHEN NEW.`status`='sent' AND NOT EXISTS (
	SELECT 1
	FROM `monitoring_preferences` preference
	JOIN `notifications` notification
		ON notification.`id`=NEW.`notification_id`
		AND notification.`workspace_id`=preference.`workspace_id`
		AND notification.`user_id`=preference.`user_id`
		AND notification.`type`='legislation_monitor'
	JOIN `workspace_members` member
		ON member.`workspace_id`=preference.`workspace_id`
		AND member.`user_id`=preference.`user_id`
		AND member.`status`='active'
	WHERE preference.`id`=NEW.`preference_id`
		AND preference.`workspace_id`=NEW.`workspace_id`
		AND preference.`user_id`=NEW.`user_id`
		AND preference.`last_delivered_at`>=NEW.`cursor_through`
		AND instr(preference.`channels_json`,'"email"')>0
)
BEGIN
	SELECT RAISE(ABORT,'MONITORING_EMAIL_SOURCE_STALE');
END;
