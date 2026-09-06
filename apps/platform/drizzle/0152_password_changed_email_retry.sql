DROP TRIGGER `security_email_jobs_recipient_immutable`;
--> statement-breakpoint
CREATE TABLE `security_email_jobs_v0152` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`challenge_id` text,
	`auth_otp_challenge_id` text,
	`event_type` text NOT NULL,
	`locale` text NOT NULL,
	`recipient_ciphertext` text NOT NULL,
	`recipient_iv` text NOT NULL,
	`recipient_key_version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`challenge_id`) REFERENCES `email_change_challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`auth_otp_challenge_id`) REFERENCES `auth_otp_challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `security_email_jobs_event_check` CHECK(`event_type` IN ('email_changed_previous_address','password_changed')),
	CONSTRAINT `security_email_jobs_locale_check` CHECK(`locale` IN ('ru','uz','en')),
	CONSTRAINT `security_email_jobs_context_check` CHECK(
		(`event_type` = 'email_changed_previous_address' AND `challenge_id` IS NOT NULL AND `auth_otp_challenge_id` IS NULL)
		OR (`event_type` = 'password_changed' AND `challenge_id` IS NULL AND `auth_otp_challenge_id` IS NOT NULL)
	),
	CONSTRAINT `security_email_jobs_status_check` CHECK(`status` IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT `security_email_jobs_attempts_check` CHECK(`attempt_count` >= 0),
	CONSTRAINT `security_email_jobs_recipient_check` CHECK(length(`recipient_ciphertext`) >= 22 AND length(`recipient_iv`) = 16 AND length(`recipient_key_version`) BETWEEN 1 AND 32),
	CONSTRAINT `security_email_jobs_evidence_check` CHECK((
		(`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NULL)
		OR (`status` IN ('retrying','failed') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NOT NULL)
		OR (`status` = 'sent' AND `provider_message_id` IS NOT NULL AND `sent_at` IS NOT NULL AND `error_code` IS NULL)
	))
);
--> statement-breakpoint
INSERT INTO `security_email_jobs_v0152` (
	`id`,`user_id`,`workspace_id`,`challenge_id`,`auth_otp_challenge_id`,
	`event_type`,`locale`,`recipient_ciphertext`,`recipient_iv`,
	`recipient_key_version`,`status`,`attempt_count`,`provider_message_id`,
	`sent_at`,`error_code`,`created_at`,`updated_at`
)
SELECT
	`id`,`user_id`,`workspace_id`,`challenge_id`,NULL,
	`event_type`,`locale`,`recipient_ciphertext`,`recipient_iv`,
	`recipient_key_version`,`status`,`attempt_count`,`provider_message_id`,
	`sent_at`,`error_code`,`created_at`,`updated_at`
FROM `security_email_jobs`;
--> statement-breakpoint
DROP TABLE `security_email_jobs`;
--> statement-breakpoint
ALTER TABLE `security_email_jobs_v0152` RENAME TO `security_email_jobs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `security_email_jobs_challenge_event_uidx` ON `security_email_jobs` (`challenge_id`,`event_type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_email_jobs_auth_otp_event_uidx` ON `security_email_jobs` (`auth_otp_challenge_id`,`event_type`);
--> statement-breakpoint
CREATE INDEX `security_email_jobs_status_idx` ON `security_email_jobs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `security_email_jobs_user_idx` ON `security_email_jobs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `security_email_jobs_recipient_immutable`
BEFORE UPDATE OF
	`recipient_ciphertext`,`recipient_iv`,`recipient_key_version`
ON `security_email_jobs`
WHEN
	NEW.`recipient_ciphertext` IS NOT OLD.`recipient_ciphertext`
	OR NEW.`recipient_iv` IS NOT OLD.`recipient_iv`
	OR NEW.`recipient_key_version` IS NOT OLD.`recipient_key_version`
BEGIN
	SELECT RAISE(ABORT, 'security email recipient is immutable');
END;
