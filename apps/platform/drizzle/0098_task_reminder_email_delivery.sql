-- Migration 0098: durable, content-free email delivery evidence for task reminders.
-- Recipient addresses remain in the protected user identity boundary and are
-- resolved only by the email consumer immediately before provider delivery.
CREATE TABLE `task_reminder_email_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`reminder_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reminder_updated_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`error_code` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reminder_id`) REFERENCES `task_reminders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `task_reminder_email_job_id_check` CHECK (`id` GLOB 'task-reminder-email:*' AND length(`id`) BETWEEN 24 AND 180),
	CONSTRAINT `task_reminder_email_job_status_check` CHECK (`status` IN ('pending','sending','retrying','sent','failed','cancelled')),
	CONSTRAINT `task_reminder_email_job_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `task_reminder_email_job_evidence_check` CHECK (
		(`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `error_code` IS NULL AND `sent_at` IS NULL)
		OR (`status`='retrying' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
		OR (`status`='sent' AND `provider_message_id` IS NOT NULL AND `error_code` IS NULL AND `sent_at` IS NOT NULL)
		OR (`status`='failed' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
		OR (`status`='cancelled' AND `provider_message_id` IS NULL AND `sent_at` IS NULL)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `task_reminder_email_jobs_source_uidx` ON `task_reminder_email_jobs` (`reminder_id`,`reminder_updated_at`);--> statement-breakpoint
CREATE INDEX `task_reminder_email_jobs_status_idx` ON `task_reminder_email_jobs` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `task_reminder_email_jobs_user_idx` ON `task_reminder_email_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `task_reminder_email_jobs_insert_guard`
BEFORE INSERT ON `task_reminder_email_jobs`
WHEN NEW.`status`<>'pending'
	OR NEW.`attempt_count`<>0
	OR NEW.`provider_message_id` IS NOT NULL
	OR NEW.`error_code` IS NOT NULL
	OR NEW.`sent_at` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `task_reminders` reminder
		JOIN `tasks` task ON task.`id`=reminder.`task_id`
		JOIN `cases` legal_case ON legal_case.`id`=task.`case_id` AND legal_case.`workspace_id`=task.`workspace_id`
		JOIN `workspace_members` member ON member.`workspace_id`=task.`workspace_id` AND member.`user_id`=task.`owner_user_id`
		WHERE reminder.`id`=NEW.`reminder_id`
			AND reminder.`channel`='email'
			AND reminder.`status`='pending'
			AND reminder.`updated_at`=NEW.`reminder_updated_at`
			AND task.`workspace_id`=NEW.`workspace_id`
			AND task.`owner_user_id`=NEW.`user_id`
			AND task.`status` NOT IN ('completed','cancelled')
			AND legal_case.`archived_at` IS NULL
			AND member.`status`='active'
	)
BEGIN
	SELECT RAISE(ABORT,'TASK_REMINDER_EMAIL_SOURCE_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `task_reminder_email_jobs_identity_immutable`
BEFORE UPDATE ON `task_reminder_email_jobs`
WHEN NEW.`id` IS NOT OLD.`id`
	OR NEW.`reminder_id` IS NOT OLD.`reminder_id`
	OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`reminder_updated_at` IS NOT OLD.`reminder_updated_at`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'TASK_REMINDER_EMAIL_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `task_reminder_email_jobs_transition_guard`
BEFORE UPDATE ON `task_reminder_email_jobs`
WHEN NOT (
	(OLD.`status` IN ('pending','retrying') AND NEW.`status`='sending'
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
		AND NEW.`provider_message_id` IS NULL AND NEW.`sent_at` IS NULL)
)
BEGIN
	SELECT RAISE(ABORT,'TASK_REMINDER_EMAIL_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `task_reminder_email_jobs_sent_guard`
BEFORE UPDATE ON `task_reminder_email_jobs`
WHEN NEW.`status`='sent' AND NOT EXISTS (
	SELECT 1 FROM `task_reminders` reminder
	JOIN `tasks` task ON task.`id`=reminder.`task_id`
	JOIN `cases` legal_case ON legal_case.`id`=task.`case_id` AND legal_case.`workspace_id`=task.`workspace_id`
	JOIN `workspace_members` member ON member.`workspace_id`=task.`workspace_id` AND member.`user_id`=task.`owner_user_id`
	WHERE reminder.`id`=NEW.`reminder_id`
		AND reminder.`channel`='email'
		AND reminder.`status`='pending'
		AND reminder.`updated_at`=NEW.`reminder_updated_at`
		AND task.`workspace_id`=NEW.`workspace_id`
		AND task.`owner_user_id`=NEW.`user_id`
		AND task.`status` NOT IN ('completed','cancelled')
		AND legal_case.`archived_at` IS NULL
		AND member.`status`='active'
)
BEGIN
	SELECT RAISE(ABORT,'TASK_REMINDER_EMAIL_SOURCE_STALE');
END;
