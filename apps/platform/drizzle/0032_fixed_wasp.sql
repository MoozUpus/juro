CREATE TABLE `security_notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`delivery_channel` text DEFAULT 'email' NOT NULL,
	`locale` text NOT NULL,
	`recipient_ciphertext` text NOT NULL,
	`recipient_iv` text NOT NULL,
	`recipient_key_version` text NOT NULL,
	`device_name` text NOT NULL,
	`country_code` text,
	`region_code` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`error_code` text,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "security_notification_jobs_event_check" CHECK("security_notification_jobs"."event_type" IN ('login_new_device','login_new_region')),
	CONSTRAINT "security_notification_jobs_channel_check" CHECK("security_notification_jobs"."delivery_channel" = 'email'),
	CONSTRAINT "security_notification_jobs_locale_check" CHECK("security_notification_jobs"."locale" IN ('ru','uz')),
	CONSTRAINT "security_notification_jobs_status_check" CHECK("security_notification_jobs"."status" IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT "security_notification_jobs_attempts_check" CHECK("security_notification_jobs"."attempt_count" >= 0),
	CONSTRAINT "security_notification_jobs_context_check" CHECK(length("security_notification_jobs"."session_id") BETWEEN 1 AND 128
        AND length("security_notification_jobs"."device_name") BETWEEN 1 AND 80
        AND ("security_notification_jobs"."country_code" IS NULL OR (
          length("security_notification_jobs"."country_code") = 2
          AND "security_notification_jobs"."country_code" NOT GLOB '*[^A-Z0-9]*'
        ))
        AND ("security_notification_jobs"."region_code" IS NULL OR (
          length("security_notification_jobs"."region_code") BETWEEN 1 AND 12
          AND "security_notification_jobs"."region_code" NOT GLOB '*[^A-Z0-9-]*'
        ))),
	CONSTRAINT "security_notification_jobs_recipient_check" CHECK(length("security_notification_jobs"."recipient_ciphertext") >= 22
        AND length("security_notification_jobs"."recipient_iv") = 16
        AND length("security_notification_jobs"."recipient_key_version") BETWEEN 1 AND 32),
	CONSTRAINT "security_notification_jobs_evidence_check" CHECK((
        ("security_notification_jobs"."status" IN ('pending','sending') AND "security_notification_jobs"."provider_message_id" IS NULL AND "security_notification_jobs"."sent_at" IS NULL AND "security_notification_jobs"."error_code" IS NULL)
        OR ("security_notification_jobs"."status" IN ('retrying','failed') AND "security_notification_jobs"."provider_message_id" IS NULL AND "security_notification_jobs"."sent_at" IS NULL AND "security_notification_jobs"."error_code" IS NOT NULL)
        OR ("security_notification_jobs"."status" = 'sent' AND "security_notification_jobs"."provider_message_id" IS NOT NULL AND "security_notification_jobs"."sent_at" IS NOT NULL AND "security_notification_jobs"."error_code" IS NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_notification_jobs_session_event_uidx` ON `security_notification_jobs` (`session_id`,`event_type`,`delivery_channel`);--> statement-breakpoint
CREATE INDEX `security_notification_jobs_status_idx` ON `security_notification_jobs` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `security_notification_jobs_user_idx` ON `security_notification_jobs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `security_notification_jobs_content_immutable`
BEFORE UPDATE OF
  `user_id`,`session_id`,`event_type`,`delivery_channel`,`locale`,
  `recipient_ciphertext`,`recipient_iv`,`recipient_key_version`,
  `device_name`,`country_code`,`region_code`,`occurred_at`,`created_at`
ON `security_notification_jobs`
WHEN
  NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`session_id` IS NOT OLD.`session_id`
  OR NEW.`event_type` IS NOT OLD.`event_type`
  OR NEW.`delivery_channel` IS NOT OLD.`delivery_channel`
  OR NEW.`locale` IS NOT OLD.`locale`
  OR NEW.`recipient_ciphertext` IS NOT OLD.`recipient_ciphertext`
  OR NEW.`recipient_iv` IS NOT OLD.`recipient_iv`
  OR NEW.`recipient_key_version` IS NOT OLD.`recipient_key_version`
  OR NEW.`device_name` IS NOT OLD.`device_name`
  OR NEW.`country_code` IS NOT OLD.`country_code`
  OR NEW.`region_code` IS NOT OLD.`region_code`
  OR NEW.`occurred_at` IS NOT OLD.`occurred_at`
  OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'security notification content is immutable');
END;