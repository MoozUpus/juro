-- Expand authoritative persisted UI locales to English without rewriting legacy content.
--> statement-breakpoint
-- Rebuilds retain rows, foreign keys, indexes, and integrity/audit triggers.
--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
-- These guards reference tables rebuilt below from other table owners. SQLite
-- validates their bodies during DROP/RENAME, so recreate them after all tables
-- are back under their canonical names.
DROP TRIGGER `account_deletion_requests_verification_guard`;
--> statement-breakpoint
DROP TRIGGER `builder_version_writes_insert_guard`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_articles_identity_update_guard`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_articles_status_guard`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_published_versions_no_delete`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_published_versions_no_update`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_created_event`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_draft_update_guard`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_draft_updated_event`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_new_actor_guard`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_no_delete`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_publish_guard`;
--> statement-breakpoint
DROP TRIGGER `knowledge_base_versions_published_event`;
--> statement-breakpoint
CREATE TABLE `__v0154_shadow_id_guard` (
	`valid` integer NOT NULL,
	CONSTRAINT `english_locale_foundation_shadow_guard_check` CHECK(`valid`=1)
);
--> statement-breakpoint
INSERT INTO `__v0154_shadow_id_guard` (`valid`)
SELECT 0
WHERE EXISTS (
	SELECT 1 FROM `email_change_challenges`
	WHERE substr(`id`,1,length('__juro_v0154_email__'))='__juro_v0154_email__'
)
	OR EXISTS (
		SELECT 1 FROM `account_deletion_challenges`
		WHERE substr(`id`,1,length('__juro_v0154_delete__'))='__juro_v0154_delete__'
	)
	OR EXISTS (
		SELECT 1 FROM `guest_ai_sessions`
		WHERE substr(`id`,1,length('__juro_v0154_guest__'))='__juro_v0154_guest__'
	)
	OR EXISTS (
		SELECT 1 FROM `knowledge_base_article_versions`
		WHERE substr(`id`,1,length('__juro_v0154_kb__'))='__juro_v0154_kb__'
	);
--> statement-breakpoint
CREATE TABLE `__new_email_change_challenges_v0154` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`current_email_hash` text NOT NULL,
	`current_email_lookup_hash` text,
	`current_email_lookup_key_version` text,
	`new_email` text NOT NULL,
	`new_email_ciphertext` text,
	`new_email_iv` text,
	`new_email_key_version` text,
	`new_email_lookup_hash` text,
	`new_email_lookup_key_version` text,
	`current_code_salt` text NOT NULL,
	`current_code_hash` text NOT NULL,
	`current_code_hmac` text,
	`current_code_key_version` text,
	`new_code_salt` text NOT NULL,
	`new_code_hash` text NOT NULL,
	`new_code_hmac` text,
	`new_code_key_version` text,
	`locale` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` text NOT NULL,
	`codes_queued_at` text,
	`consumed_at` text,
	`consumed_by_operation_id` text,
	`invalidated_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "email_change_challenges_locale_check" CHECK("__new_email_change_challenges_v0154"."locale" IN ('ru','uz','en')),
	CONSTRAINT "email_change_challenges_attempts_check" CHECK("__new_email_change_challenges_v0154"."attempt_count" >= 0 AND "__new_email_change_challenges_v0154"."attempt_count" <= "__new_email_change_challenges_v0154"."max_attempts" AND "__new_email_change_challenges_v0154"."max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
INSERT INTO `__new_email_change_challenges_v0154` (`id`,`user_id`,`session_id`,`current_email_hash`,`current_email_lookup_hash`,`current_email_lookup_key_version`,`new_email`,`new_email_ciphertext`,`new_email_iv`,`new_email_key_version`,`new_email_lookup_hash`,`new_email_lookup_key_version`,`current_code_salt`,`current_code_hash`,`current_code_hmac`,`current_code_key_version`,`new_code_salt`,`new_code_hash`,`new_code_hmac`,`new_code_key_version`,`locale`,`attempt_count`,`max_attempts`,`expires_at`,`codes_queued_at`,`consumed_at`,`consumed_by_operation_id`,`invalidated_at`,`created_at`) SELECT `id`,`user_id`,`session_id`,`current_email_hash`,`current_email_lookup_hash`,`current_email_lookup_key_version`,`new_email`,`new_email_ciphertext`,`new_email_iv`,`new_email_key_version`,`new_email_lookup_hash`,`new_email_lookup_key_version`,`current_code_salt`,`current_code_hash`,`current_code_hmac`,`current_code_key_version`,`new_code_salt`,`new_code_hash`,`new_code_hmac`,`new_code_key_version`,`locale`,`attempt_count`,`max_attempts`,`expires_at`,`codes_queued_at`,`consumed_at`,`consumed_by_operation_id`,`invalidated_at`,`created_at` FROM `email_change_challenges`;
--> statement-breakpoint
UPDATE `email_change_challenges`
SET `id`='__juro_v0154_email__' || `id`;
--> statement-breakpoint
DROP TABLE `email_change_challenges`;
--> statement-breakpoint
ALTER TABLE `__new_email_change_challenges_v0154` RENAME TO `email_change_challenges`;
--> statement-breakpoint
CREATE UNIQUE INDEX `email_change_challenges_active_user_uidx` ON `email_change_challenges` (`user_id`) WHERE "email_change_challenges"."consumed_at" IS NULL AND "email_change_challenges"."invalidated_at" IS NULL;
--> statement-breakpoint
CREATE INDEX `email_change_challenges_expiry_idx` ON `email_change_challenges` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `email_change_challenges_new_email_lookup_idx` ON `email_change_challenges` (`new_email_lookup_key_version`,`new_email_lookup_hash`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_change_challenges_operation_uidx` ON `email_change_challenges` (`consumed_by_operation_id`);
--> statement-breakpoint
CREATE INDEX `email_change_challenges_user_created_idx` ON `email_change_challenges` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `email_change_challenge_attempt_update_guard`
BEFORE UPDATE OF `attempt_count`,`max_attempts`
ON `email_change_challenges`
WHEN
  NEW.`attempt_count` < OLD.`attempt_count`
  OR NEW.`attempt_count` > NEW.`max_attempts`
  OR NEW.`max_attempts` IS NOT OLD.`max_attempts`
BEGIN
  SELECT RAISE(ABORT, 'email change challenge attempt state invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `email_change_challenge_evidence_insert_guard`
BEFORE INSERT ON `email_change_challenges`
WHEN NOT (
  (
    NEW.`current_email_lookup_hash` IS NULL
    AND NEW.`current_email_lookup_key_version` IS NULL
    AND NEW.`new_email_ciphertext` IS NULL
    AND NEW.`new_email_iv` IS NULL
    AND NEW.`new_email_key_version` IS NULL
    AND NEW.`new_email_lookup_hash` IS NULL
    AND NEW.`new_email_lookup_key_version` IS NULL
    AND NEW.`current_code_hmac` IS NULL
    AND NEW.`current_code_key_version` IS NULL
    AND NEW.`new_code_hmac` IS NULL
    AND NEW.`new_code_key_version` IS NULL
  )
  OR
  (
    NEW.`current_email_lookup_hash` IS NOT NULL
    AND NEW.`current_email_lookup_key_version` IS NOT NULL
    AND NEW.`new_email_ciphertext` IS NOT NULL
    AND NEW.`new_email_iv` IS NOT NULL
    AND NEW.`new_email_key_version` IS NOT NULL
    AND NEW.`new_email_lookup_hash` IS NOT NULL
    AND NEW.`new_email_lookup_key_version` IS NOT NULL
    AND NEW.`current_code_hmac` IS NOT NULL
    AND NEW.`current_code_key_version` IS NOT NULL
    AND NEW.`new_code_hmac` IS NOT NULL
    AND NEW.`new_code_key_version` IS NOT NULL
    AND length(NEW.`current_email_lookup_hash`) = 43
    AND length(NEW.`new_email_lookup_hash`) = 43
    AND length(NEW.`current_code_hmac`) = 43
    AND length(NEW.`new_code_hmac`) = 43
    AND length(NEW.`new_email_iv`) = 16
    AND length(NEW.`new_email_ciphertext`) >= 22
    AND length(NEW.`current_email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`new_email_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`new_email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`current_code_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`new_code_key_version`) BETWEEN 1 AND 32
    AND NEW.`current_email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_email_ciphertext` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_email_iv` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`current_code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`current_email_lookup_key_version`
      NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`new_email_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`new_email_lookup_key_version`
      NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`current_code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`new_code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'email change challenge evidence incomplete');
END;
--> statement-breakpoint
CREATE TRIGGER `email_change_challenge_evidence_update_guard`
BEFORE UPDATE OF
  `current_email_lookup_hash`,`current_email_lookup_key_version`,
  `new_email_ciphertext`,`new_email_iv`,`new_email_key_version`,
  `new_email_lookup_hash`,`new_email_lookup_key_version`,
  `current_code_hmac`,`current_code_key_version`,
  `new_code_hmac`,`new_code_key_version`
ON `email_change_challenges`
WHEN NOT (
  (
    NEW.`current_email_lookup_hash` IS NULL
    AND NEW.`current_email_lookup_key_version` IS NULL
    AND NEW.`new_email_ciphertext` IS NULL
    AND NEW.`new_email_iv` IS NULL
    AND NEW.`new_email_key_version` IS NULL
    AND NEW.`new_email_lookup_hash` IS NULL
    AND NEW.`new_email_lookup_key_version` IS NULL
    AND NEW.`current_code_hmac` IS NULL
    AND NEW.`current_code_key_version` IS NULL
    AND NEW.`new_code_hmac` IS NULL
    AND NEW.`new_code_key_version` IS NULL
  )
  OR
  (
    NEW.`current_email_lookup_hash` IS NOT NULL
    AND NEW.`current_email_lookup_key_version` IS NOT NULL
    AND NEW.`new_email_ciphertext` IS NOT NULL
    AND NEW.`new_email_iv` IS NOT NULL
    AND NEW.`new_email_key_version` IS NOT NULL
    AND NEW.`new_email_lookup_hash` IS NOT NULL
    AND NEW.`new_email_lookup_key_version` IS NOT NULL
    AND NEW.`current_code_hmac` IS NOT NULL
    AND NEW.`current_code_key_version` IS NOT NULL
    AND NEW.`new_code_hmac` IS NOT NULL
    AND NEW.`new_code_key_version` IS NOT NULL
    AND length(NEW.`current_email_lookup_hash`) = 43
    AND length(NEW.`new_email_lookup_hash`) = 43
    AND length(NEW.`current_code_hmac`) = 43
    AND length(NEW.`new_code_hmac`) = 43
    AND length(NEW.`new_email_iv`) = 16
    AND length(NEW.`new_email_ciphertext`) >= 22
    AND length(NEW.`current_email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`new_email_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`new_email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`current_code_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`new_code_key_version`) BETWEEN 1 AND 32
    AND NEW.`current_email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_email_ciphertext` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_email_iv` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`current_code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`new_code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`current_email_lookup_key_version`
      NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`new_email_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`new_email_lookup_key_version`
      NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`current_code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`new_code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'email change challenge evidence incomplete');
END;
--> statement-breakpoint
CREATE TRIGGER `email_change_challenge_state_insert_guard`
BEFORE INSERT ON `email_change_challenges`
WHEN
  NEW.`consumed_at` IS NOT NULL
  OR NEW.`consumed_by_operation_id` IS NOT NULL
  OR NEW.`invalidated_at` IS NOT NULL
  OR NEW.`codes_queued_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'email change challenge initial state invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `email_change_challenge_state_update_guard`
BEFORE UPDATE OF
  `codes_queued_at`,`consumed_at`,`consumed_by_operation_id`,`invalidated_at`
ON `email_change_challenges`
WHEN NOT (
  (
    NEW.`consumed_at` IS NULL
    AND NEW.`consumed_by_operation_id` IS NULL
  )
  OR
  (
    NEW.`consumed_at` IS NOT NULL
    AND NEW.`consumed_by_operation_id` IS NOT NULL
    AND NEW.`codes_queued_at` IS NOT NULL
    AND NEW.`invalidated_at` IS NULL
  )
)
OR (
  NEW.`consumed_at` IS NOT NULL
  AND NEW.`invalidated_at` IS NOT NULL
)
OR (
  OLD.`codes_queued_at` IS NOT NULL
  AND NEW.`codes_queued_at` IS NOT OLD.`codes_queued_at`
)
OR (
  OLD.`consumed_at` IS NOT NULL
  AND (
    NEW.`consumed_at` IS NOT OLD.`consumed_at`
    OR NEW.`consumed_by_operation_id`
      IS NOT OLD.`consumed_by_operation_id`
  )
)
OR (
  OLD.`invalidated_at` IS NOT NULL
  AND NEW.`invalidated_at` IS NOT OLD.`invalidated_at`
)
BEGIN
  SELECT RAISE(ABORT, 'email change challenge state invalid');
END;
--> statement-breakpoint
CREATE TABLE `__new_security_notification_jobs_v0154` (
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
	CONSTRAINT "security_notification_jobs_event_check" CHECK("__new_security_notification_jobs_v0154"."event_type" IN ('login_new_device','login_new_region')),
	CONSTRAINT "security_notification_jobs_channel_check" CHECK("__new_security_notification_jobs_v0154"."delivery_channel" = 'email'),
	CONSTRAINT "security_notification_jobs_locale_check" CHECK("__new_security_notification_jobs_v0154"."locale" IN ('ru','uz','en')),
	CONSTRAINT "security_notification_jobs_status_check" CHECK("__new_security_notification_jobs_v0154"."status" IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT "security_notification_jobs_attempts_check" CHECK("__new_security_notification_jobs_v0154"."attempt_count" >= 0),
	CONSTRAINT "security_notification_jobs_context_check" CHECK(length("__new_security_notification_jobs_v0154"."session_id") BETWEEN 1 AND 128
        AND length("__new_security_notification_jobs_v0154"."device_name") BETWEEN 1 AND 80
        AND ("__new_security_notification_jobs_v0154"."country_code" IS NULL OR (
          length("__new_security_notification_jobs_v0154"."country_code") = 2
          AND "__new_security_notification_jobs_v0154"."country_code" NOT GLOB '*[^A-Z0-9]*'
        ))
        AND ("__new_security_notification_jobs_v0154"."region_code" IS NULL OR (
          length("__new_security_notification_jobs_v0154"."region_code") BETWEEN 1 AND 12
          AND "__new_security_notification_jobs_v0154"."region_code" NOT GLOB '*[^A-Z0-9-]*'
        ))),
	CONSTRAINT "security_notification_jobs_recipient_check" CHECK(length("__new_security_notification_jobs_v0154"."recipient_ciphertext") >= 22
        AND length("__new_security_notification_jobs_v0154"."recipient_iv") = 16
        AND length("__new_security_notification_jobs_v0154"."recipient_key_version") BETWEEN 1 AND 32),
	CONSTRAINT "security_notification_jobs_evidence_check" CHECK((
        ("__new_security_notification_jobs_v0154"."status" IN ('pending','sending') AND "__new_security_notification_jobs_v0154"."provider_message_id" IS NULL AND "__new_security_notification_jobs_v0154"."sent_at" IS NULL AND "__new_security_notification_jobs_v0154"."error_code" IS NULL)
        OR ("__new_security_notification_jobs_v0154"."status" IN ('retrying','failed') AND "__new_security_notification_jobs_v0154"."provider_message_id" IS NULL AND "__new_security_notification_jobs_v0154"."sent_at" IS NULL AND "__new_security_notification_jobs_v0154"."error_code" IS NOT NULL)
        OR ("__new_security_notification_jobs_v0154"."status" = 'sent' AND "__new_security_notification_jobs_v0154"."provider_message_id" IS NOT NULL AND "__new_security_notification_jobs_v0154"."sent_at" IS NOT NULL AND "__new_security_notification_jobs_v0154"."error_code" IS NULL)
      ))
);
--> statement-breakpoint
INSERT INTO `__new_security_notification_jobs_v0154` (`id`,`user_id`,`workspace_id`,`session_id`,`event_type`,`delivery_channel`,`locale`,`recipient_ciphertext`,`recipient_iv`,`recipient_key_version`,`device_name`,`country_code`,`region_code`,`status`,`attempt_count`,`provider_message_id`,`sent_at`,`error_code`,`occurred_at`,`created_at`,`updated_at`) SELECT `id`,`user_id`,`workspace_id`,`session_id`,`event_type`,`delivery_channel`,`locale`,`recipient_ciphertext`,`recipient_iv`,`recipient_key_version`,`device_name`,`country_code`,`region_code`,`status`,`attempt_count`,`provider_message_id`,`sent_at`,`error_code`,`occurred_at`,`created_at`,`updated_at` FROM `security_notification_jobs`;
--> statement-breakpoint
DROP TABLE `security_notification_jobs`;
--> statement-breakpoint
ALTER TABLE `__new_security_notification_jobs_v0154` RENAME TO `security_notification_jobs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `security_notification_jobs_session_event_uidx` ON `security_notification_jobs` (`session_id`,`event_type`,`delivery_channel`);
--> statement-breakpoint
CREATE INDEX `security_notification_jobs_status_idx` ON `security_notification_jobs` (`status`,`updated_at`);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `__new_account_deletion_challenges_v0154` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`email_hash` text NOT NULL,
	`locale` text NOT NULL,
	`code_salt` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumed_by_operation_id` text,
	`invalidated_at` text,
	`created_at` text NOT NULL, `email_lookup_hash` text, `email_lookup_key_version` text, `code_hmac` text, `code_key_version` text,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "account_deletion_challenges_locale_check" CHECK("__new_account_deletion_challenges_v0154"."locale" IN ('ru','uz','en')),
	CONSTRAINT "account_deletion_challenges_attempts_check" CHECK("__new_account_deletion_challenges_v0154"."attempt_count" >= 0 AND "__new_account_deletion_challenges_v0154"."max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
INSERT INTO `__new_account_deletion_challenges_v0154` (`id`,`user_id`,`session_id`,`email_hash`,`locale`,`code_salt`,`code_hash`,`attempt_count`,`max_attempts`,`expires_at`,`consumed_at`,`consumed_by_operation_id`,`invalidated_at`,`created_at`,`email_lookup_hash`,`email_lookup_key_version`,`code_hmac`,`code_key_version`) SELECT `id`,`user_id`,`session_id`,`email_hash`,`locale`,`code_salt`,`code_hash`,`attempt_count`,`max_attempts`,`expires_at`,`consumed_at`,`consumed_by_operation_id`,`invalidated_at`,`created_at`,`email_lookup_hash`,`email_lookup_key_version`,`code_hmac`,`code_key_version` FROM `account_deletion_challenges`;
--> statement-breakpoint
UPDATE `account_deletion_challenges`
SET `id`='__juro_v0154_delete__' || `id`;
--> statement-breakpoint
DROP TABLE `account_deletion_challenges`;
--> statement-breakpoint
ALTER TABLE `__new_account_deletion_challenges_v0154` RENAME TO `account_deletion_challenges`;
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_challenges_active_user_uidx` ON `account_deletion_challenges` (`user_id`) WHERE "account_deletion_challenges"."consumed_at" IS NULL AND "account_deletion_challenges"."invalidated_at" IS NULL;
--> statement-breakpoint
CREATE INDEX `account_deletion_challenges_expiry_idx` ON `account_deletion_challenges` (`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_challenges_operation_uidx` ON `account_deletion_challenges` (`consumed_by_operation_id`);
--> statement-breakpoint
CREATE INDEX `account_deletion_challenges_user_created_idx` ON `account_deletion_challenges` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `account_deletion_challenge_evidence_insert_guard`
BEFORE INSERT ON `account_deletion_challenges`
WHEN NOT (
  (
    NEW.`email_lookup_hash` IS NULL
    AND NEW.`email_lookup_key_version` IS NULL
    AND NEW.`code_hmac` IS NULL
    AND NEW.`code_key_version` IS NULL
  )
  OR
  (
    NEW.`email_lookup_hash` IS NOT NULL
    AND NEW.`email_lookup_key_version` IS NOT NULL
    AND NEW.`code_hmac` IS NOT NULL
    AND NEW.`code_key_version` IS NOT NULL
    AND length(NEW.`email_lookup_hash`) = 43
    AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`code_hmac`) = 43
    AND length(NEW.`code_key_version`) BETWEEN 1 AND 32
    AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`email_lookup_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account deletion challenge evidence incomplete'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `account_deletion_challenge_evidence_update_guard`
BEFORE UPDATE OF
  `email_lookup_hash`,`email_lookup_key_version`,
  `code_hmac`,`code_key_version`
ON `account_deletion_challenges`
WHEN NOT (
  (
    NEW.`email_lookup_hash` IS NULL
    AND NEW.`email_lookup_key_version` IS NULL
    AND NEW.`code_hmac` IS NULL
    AND NEW.`code_key_version` IS NULL
  )
  OR
  (
    NEW.`email_lookup_hash` IS NOT NULL
    AND NEW.`email_lookup_key_version` IS NOT NULL
    AND NEW.`code_hmac` IS NOT NULL
    AND NEW.`code_key_version` IS NOT NULL
    AND length(NEW.`email_lookup_hash`) = 43
    AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`code_hmac`) = 43
    AND length(NEW.`code_key_version`) BETWEEN 1 AND 32
    AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`email_lookup_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account deletion challenge evidence incomplete'
  );
END;
--> statement-breakpoint
CREATE TABLE `__new_ai_document_prefill_handoffs_v0154` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assistant_message_id` text NOT NULL,
	`template_code` text NOT NULL,
	`document_id` text NOT NULL,
	`locale` text NOT NULL,
	`selected_field_ids_json` text NOT NULL,
	`selection_sha256` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ai_document_prefill_handoffs_locale_check` CHECK (`locale` IN ('ru','uz','en')),
	CONSTRAINT `ai_document_prefill_handoffs_fields_check` CHECK (
		json_valid(`selected_field_ids_json`)
		AND json_type(`selected_field_ids_json`)='array'
		AND length(`selected_field_ids_json`) BETWEEN 2 AND 10000
	),
	CONSTRAINT `ai_document_prefill_handoffs_hash_check` CHECK (
		`selection_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	)
);
--> statement-breakpoint
INSERT INTO `__new_ai_document_prefill_handoffs_v0154` (`id`,`workspace_id`,`user_id`,`assistant_message_id`,`template_code`,`document_id`,`locale`,`selected_field_ids_json`,`selection_sha256`,`idempotency_key_sha256`,`created_at`) SELECT `id`,`workspace_id`,`user_id`,`assistant_message_id`,`template_code`,`document_id`,`locale`,`selected_field_ids_json`,`selection_sha256`,`idempotency_key_sha256`,`created_at` FROM `ai_document_prefill_handoffs`;
--> statement-breakpoint
DROP TABLE `ai_document_prefill_handoffs`;
--> statement-breakpoint
ALTER TABLE `__new_ai_document_prefill_handoffs_v0154` RENAME TO `ai_document_prefill_handoffs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_document_prefill_handoffs_document_uidx` ON `ai_document_prefill_handoffs` (`document_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_document_prefill_handoffs_request_uidx` ON `ai_document_prefill_handoffs` (`workspace_id`,`user_id`,`idempotency_key_sha256`);
--> statement-breakpoint
CREATE INDEX `ai_document_prefill_handoffs_source_idx` ON `ai_document_prefill_handoffs` (`assistant_message_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `ai_document_prefill_handoffs_immutable_update`
BEFORE UPDATE ON `ai_document_prefill_handoffs`
BEGIN
	SELECT RAISE(ABORT,'AI_DOCUMENT_HANDOFF_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_document_prefill_handoffs_insert_guard`
BEFORE INSERT ON `ai_document_prefill_handoffs`
WHEN NOT EXISTS (
	SELECT 1 FROM `workspace_members` AS member
	WHERE member.`workspace_id`=NEW.`workspace_id`
		AND member.`user_id`=NEW.`user_id`
		AND member.`status`='active'
)
OR NOT EXISTS (
	SELECT 1 FROM `conversation_messages` AS message
	JOIN `conversations` AS conversation ON conversation.`id`=message.`conversation_id`
	WHERE message.`id`=NEW.`assistant_message_id`
		AND message.`author_type`='assistant'
		AND message.`structured_json` IS NOT NULL
		AND conversation.`workspace_id`=NEW.`workspace_id`
		AND conversation.`owner_user_id`=NEW.`user_id`
)
OR NOT EXISTS (
	SELECT 1 FROM `documents` AS document
	WHERE document.`id`=NEW.`document_id`
		AND document.`workspace_id`=NEW.`workspace_id`
		AND document.`owner_user_id`=NEW.`user_id`
		AND document.`template_code`=NEW.`template_code`
		AND document.`status`='Черновик'
)
BEGIN
	SELECT RAISE(ABORT,'AI_DOCUMENT_HANDOFF_CONFLICT');
END;
--> statement-breakpoint
CREATE TABLE `__new_builder_document_analysis_handoffs_v0154` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_revision` integer NOT NULL,
	`document_content_sha256` text NOT NULL,
	`file_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`mode` text NOT NULL,
	`locale` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builder_analysis_revision_check` CHECK (`document_revision`>0),
	CONSTRAINT `builder_analysis_mode_check` CHECK (`mode` IN ('quick','full','expert')),
	CONSTRAINT `builder_analysis_locale_check` CHECK (`locale` IN ('ru','uz','en')),
	CONSTRAINT `builder_analysis_status_check` CHECK (`status` IN ('pending','ready')),
	CONSTRAINT `builder_analysis_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `builder_analysis_hash_check` CHECK (
		`document_content_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
		AND `idempotency_key_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	),
	CONSTRAINT `builder_analysis_state_check` CHECK (
		(`status`='pending')
		OR (`status`='ready' AND `last_error_code` IS NULL)
	)
);
--> statement-breakpoint
INSERT INTO `__new_builder_document_analysis_handoffs_v0154` (`id`,`workspace_id`,`user_id`,`document_id`,`document_revision`,`document_content_sha256`,`file_id`,`analysis_id`,`mode`,`locale`,`idempotency_key_sha256`,`status`,`attempt_count`,`last_error_code`,`created_at`,`updated_at`) SELECT `id`,`workspace_id`,`user_id`,`document_id`,`document_revision`,`document_content_sha256`,`file_id`,`analysis_id`,`mode`,`locale`,`idempotency_key_sha256`,`status`,`attempt_count`,`last_error_code`,`created_at`,`updated_at` FROM `builder_document_analysis_handoffs`;
--> statement-breakpoint
DROP TABLE `builder_document_analysis_handoffs`;
--> statement-breakpoint
ALTER TABLE `__new_builder_document_analysis_handoffs_v0154` RENAME TO `builder_document_analysis_handoffs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_analysis_analysis_uidx` ON `builder_document_analysis_handoffs` (`analysis_id`);
--> statement-breakpoint
CREATE INDEX `builder_analysis_document_idx` ON `builder_document_analysis_handoffs` (`document_id`,`created_at` DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_analysis_file_uidx` ON `builder_document_analysis_handoffs` (`file_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_analysis_request_uidx` ON `builder_document_analysis_handoffs` (`workspace_id`,`user_id`,`idempotency_key_sha256`);
--> statement-breakpoint
CREATE TRIGGER `builder_analysis_handoff_identity_immutable`
BEFORE UPDATE ON `builder_document_analysis_handoffs`
WHEN NEW.`id` IS NOT OLD.`id`
	OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`document_id` IS NOT OLD.`document_id`
	OR NEW.`document_revision`<>OLD.`document_revision`
	OR NEW.`document_content_sha256` IS NOT OLD.`document_content_sha256`
	OR NEW.`file_id` IS NOT OLD.`file_id`
	OR NEW.`analysis_id` IS NOT OLD.`analysis_id`
	OR NEW.`mode` IS NOT OLD.`mode`
	OR NEW.`locale` IS NOT OLD.`locale`
	OR NEW.`idempotency_key_sha256` IS NOT OLD.`idempotency_key_sha256`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'BUILDER_ANALYSIS_HANDOFF_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `builder_analysis_handoff_insert_guard`
BEFORE INSERT ON `builder_document_analysis_handoffs`
WHEN NEW.`status`<>'pending'
	OR NEW.`attempt_count`<>0
	OR NEW.`last_error_code` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `workspace_members` AS member
		WHERE member.`workspace_id`=NEW.`workspace_id`
			AND member.`user_id`=NEW.`user_id`
			AND member.`status`='active'
	)
	OR NOT EXISTS (
		SELECT 1 FROM `documents` AS document
		JOIN `document_current_content` AS content ON content.`document_id`=document.`id`
		WHERE document.`id`=NEW.`document_id`
			AND document.`workspace_id`=NEW.`workspace_id`
			AND document.`owner_user_id`=NEW.`user_id`
			AND document.`revision`=NEW.`document_revision`
			AND document.`archived_at` IS NULL
			AND length(trim(content.`final_content`))>=24
	)
	OR NOT EXISTS (
		SELECT 1 FROM `document_files` AS file
		WHERE file.`id`=NEW.`file_id`
			AND file.`workspace_id`=NEW.`workspace_id`
			AND file.`owner_user_id`=NEW.`user_id`
			AND file.`document_id`=NEW.`document_id`
			AND file.`kind`='analysis_snapshot_pending'
			AND file.`sha256`=NEW.`document_content_sha256`
			AND file.`mime_type`='text/markdown; charset=utf-8'
			AND file.`archived_at` IS NULL
	)
	OR NOT EXISTS (
		SELECT 1 FROM `document_analyses` AS analysis
		WHERE analysis.`id`=NEW.`analysis_id`
			AND analysis.`workspace_id`=NEW.`workspace_id`
			AND analysis.`owner_user_id`=NEW.`user_id`
			AND analysis.`uploaded_file_id`=NEW.`file_id`
			AND analysis.`status`='initiated'
	)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_ANALYSIS_HANDOFF_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `builder_analysis_handoff_transition_guard`
BEFORE UPDATE ON `builder_document_analysis_handoffs`
WHEN NOT (
	(OLD.`status`='pending' AND NEW.`status`='pending'
		AND NEW.`attempt_count`=OLD.`attempt_count`+1
		AND NEW.`last_error_code` IS NOT NULL)
	OR (OLD.`status`='pending' AND NEW.`status`='ready'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`last_error_code` IS NULL
		AND EXISTS (
			SELECT 1 FROM `document_files` AS file
			JOIN `document_analyses` AS analysis ON analysis.`uploaded_file_id`=file.`id`
			JOIN `job_outbox` AS outbox ON outbox.`subject_id`=analysis.`id`
			WHERE file.`id`=NEW.`file_id`
				AND file.`kind`='analysis_safe'
				AND file.`sha256`=NEW.`document_content_sha256`
				AND analysis.`id`=NEW.`analysis_id`
				AND analysis.`status`='ready'
				AND outbox.`job_type`='document.analyze'
				AND outbox.`workspace_id`=NEW.`workspace_id`
				AND outbox.`status`='pending'
		)
	)
)
BEGIN
	SELECT RAISE(ABORT,'BUILDER_ANALYSIS_HANDOFF_TRANSITION_INVALID');
END;
--> statement-breakpoint
CREATE TABLE `__new_voice_recordings_v0154` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `conversation_id` text,
  `case_id` text,
  `message_id` text,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `object_key` text NOT NULL,
  `quarantine_key` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `duration_ms` integer NOT NULL,
  `sha256` text NOT NULL,
  `locale` text NOT NULL,
  `status` text DEFAULT 'initiated' NOT NULL,
  `transcript_ciphertext` text,
  `transcript_iv` text,
  `transcript_key_version` text,
  `provider` text,
  `model` text,
  `error_code` text,
  `expires_at` text NOT NULL,
  `uploaded_at` text,
  `transcribed_at` text,
  `submitted_at` text,
  `deleted_at` text,
  `purged_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `voice_recordings_locale_check` CHECK(`locale` IN ('ru','uz','en')),
  CONSTRAINT `voice_recordings_status_check` CHECK(`status` IN ('initiated','uploaded','ready','transcribing','transcribed','submitted','failed','deleted','purged')),
  CONSTRAINT `voice_recordings_size_check` CHECK(`size_bytes` BETWEEN 1 AND 26214400),
  CONSTRAINT `voice_recordings_duration_check` CHECK(`duration_ms` BETWEEN 1 AND 300000),
  CONSTRAINT `voice_recordings_sha_check` CHECK(length(`sha256`)=64),
  CONSTRAINT `voice_recordings_request_hash_check` CHECK(length(`request_hash`)=64),
  CONSTRAINT `voice_recordings_transcript_check` CHECK(
    (`status` IN ('transcribed','submitted') AND `transcript_ciphertext` IS NOT NULL AND `transcript_iv` IS NOT NULL AND `transcript_key_version` IS NOT NULL AND `transcribed_at` IS NOT NULL)
    OR (`status` NOT IN ('transcribed','submitted') AND `transcript_ciphertext` IS NULL AND `transcript_iv` IS NULL AND `transcript_key_version` IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO `__new_voice_recordings_v0154` (`id`,`workspace_id`,`user_id`,`conversation_id`,`case_id`,`message_id`,`idempotency_key`,`request_hash`,`object_key`,`quarantine_key`,`mime_type`,`size_bytes`,`duration_ms`,`sha256`,`locale`,`status`,`transcript_ciphertext`,`transcript_iv`,`transcript_key_version`,`provider`,`model`,`error_code`,`expires_at`,`uploaded_at`,`transcribed_at`,`submitted_at`,`deleted_at`,`purged_at`,`created_at`,`updated_at`) SELECT `id`,`workspace_id`,`user_id`,`conversation_id`,`case_id`,`message_id`,`idempotency_key`,`request_hash`,`object_key`,`quarantine_key`,`mime_type`,`size_bytes`,`duration_ms`,`sha256`,`locale`,`status`,`transcript_ciphertext`,`transcript_iv`,`transcript_key_version`,`provider`,`model`,`error_code`,`expires_at`,`uploaded_at`,`transcribed_at`,`submitted_at`,`deleted_at`,`purged_at`,`created_at`,`updated_at` FROM `voice_recordings`;
--> statement-breakpoint
DROP TABLE `voice_recordings`;
--> statement-breakpoint
ALTER TABLE `__new_voice_recordings_v0154` RENAME TO `voice_recordings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_recordings_object_key_uidx` ON `voice_recordings` (`object_key`);
--> statement-breakpoint
CREATE INDEX `voice_recordings_retention_idx` ON `voice_recordings` (`status`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_recordings_user_idempotency_uidx` ON `voice_recordings` (`user_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `voice_recordings_workspace_created_idx` ON `voice_recordings` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `__new_guest_ai_sessions_v0154` (
  `id` text PRIMARY KEY NOT NULL,
  `token_hmac` text NOT NULL,
  `token_key_version` text NOT NULL,
  `ip_hmac` text NOT NULL,
  `locale` text NOT NULL,
  `state` text DEFAULT 'available' NOT NULL,
  `request_count` integer DEFAULT 0 NOT NULL,
  `answer_count` integer DEFAULT 0 NOT NULL,
  `reserved_run_id` text,
  `reservation_expires_at` text,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `guest_ai_sessions_locale_check` CHECK(`locale` IN ('ru','uz','en')),
  CONSTRAINT `guest_ai_sessions_state_check` CHECK(`state` IN ('available','reserved','consumed')),
  CONSTRAINT `guest_ai_sessions_request_count_check` CHECK(`request_count` BETWEEN 0 AND 5),
  CONSTRAINT `guest_ai_sessions_answer_count_check` CHECK(`answer_count` BETWEEN 0 AND 1),
  CONSTRAINT `guest_ai_sessions_reservation_check` CHECK(
    (`state`='reserved' AND `reserved_run_id` IS NOT NULL AND `reservation_expires_at` IS NOT NULL)
    OR (`state` IN ('available','consumed') AND `reserved_run_id` IS NULL AND `reservation_expires_at` IS NULL)
  ),
  CONSTRAINT `guest_ai_sessions_consumed_check` CHECK(
    (`state`='consumed' AND `answer_count`=1 AND `consumed_at` IS NOT NULL)
    OR (`state`<>'consumed' AND `answer_count`=0 AND `consumed_at` IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO `__new_guest_ai_sessions_v0154` (`id`,`token_hmac`,`token_key_version`,`ip_hmac`,`locale`,`state`,`request_count`,`answer_count`,`reserved_run_id`,`reservation_expires_at`,`expires_at`,`consumed_at`,`created_at`,`updated_at`) SELECT `id`,`token_hmac`,`token_key_version`,`ip_hmac`,`locale`,`state`,`request_count`,`answer_count`,`reserved_run_id`,`reservation_expires_at`,`expires_at`,`consumed_at`,`created_at`,`updated_at` FROM `guest_ai_sessions`;
--> statement-breakpoint
UPDATE `guest_ai_sessions`
SET `id`='__juro_v0154_guest__' || `id`;
--> statement-breakpoint
DROP TABLE `guest_ai_sessions`;
--> statement-breakpoint
ALTER TABLE `__new_guest_ai_sessions_v0154` RENAME TO `guest_ai_sessions`;
--> statement-breakpoint
CREATE INDEX `guest_ai_sessions_expiry_idx` ON `guest_ai_sessions` (`expires_at`,`state`);
--> statement-breakpoint
CREATE INDEX `guest_ai_sessions_ip_created_idx` ON `guest_ai_sessions` (`ip_hmac`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_ai_sessions_token_uidx` ON `guest_ai_sessions` (`token_hmac`);
--> statement-breakpoint
CREATE TABLE `__new_knowledge_base_article_versions_v0154` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text NOT NULL,
  `version_number` integer NOT NULL,
  `title_ru` text NOT NULL,
  `title_uz` text NOT NULL,
  `title_en` text,
  `summary_ru` text NOT NULL,
  `summary_uz` text NOT NULL,
  `summary_en` text,
  `body_ru_json` text NOT NULL,
  `body_uz_json` text NOT NULL,
  `body_en_json` text,
  `related_slugs_json` text DEFAULT '[]' NOT NULL,
  `content_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  `published_at` text, `created_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict, `updated_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict, `published_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict, `updated_at` text, `content_hash_version` text DEFAULT 'body-v1' NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `knowledge_base_articles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `knowledge_base_article_versions_number_check` CHECK (`version_number` >= 1),
  CONSTRAINT `knowledge_base_article_versions_hash_check` CHECK (length(`content_sha256`) = 64),
  CONSTRAINT `knowledge_base_article_versions_body_ru_check` CHECK (json_valid(`body_ru_json`)),
  CONSTRAINT `knowledge_base_article_versions_body_uz_check` CHECK (json_valid(`body_uz_json`)),
  CONSTRAINT `knowledge_base_article_versions_body_en_check` CHECK (`body_en_json` IS NULL OR json_valid(`body_en_json`)),
  CONSTRAINT `knowledge_base_article_versions_related_check` CHECK (json_valid(`related_slugs_json`))
);
--> statement-breakpoint
INSERT INTO `__new_knowledge_base_article_versions_v0154` (`id`,`article_id`,`version_number`,`title_ru`,`title_uz`,`summary_ru`,`summary_uz`,`body_ru_json`,`body_uz_json`,`related_slugs_json`,`content_sha256`,`created_at`,`published_at`,`created_by_user_id`,`updated_by_user_id`,`published_by_user_id`,`updated_at`,`content_hash_version`) SELECT `id`,`article_id`,`version_number`,`title_ru`,`title_uz`,`summary_ru`,`summary_uz`,`body_ru_json`,`body_uz_json`,`related_slugs_json`,`content_sha256`,`created_at`,`published_at`,`created_by_user_id`,`updated_by_user_id`,`published_by_user_id`,`updated_at`,`content_hash_version` FROM `knowledge_base_article_versions`;
--> statement-breakpoint
UPDATE `knowledge_base_article_versions`
SET `id`='__juro_v0154_kb__' || `id`;
--> statement-breakpoint
DROP TABLE `knowledge_base_article_versions`;
--> statement-breakpoint
ALTER TABLE `__new_knowledge_base_article_versions_v0154` RENAME TO `knowledge_base_article_versions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_base_article_versions_number_uidx` ON `knowledge_base_article_versions` (`article_id`,`version_number`);
--> statement-breakpoint
CREATE INDEX `knowledge_base_article_versions_published_idx` ON `knowledge_base_article_versions` (`article_id`,`published_at`,`version_number`);
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_published_versions_no_delete`
BEFORE DELETE ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NOT NULL AND EXISTS (SELECT 1 FROM `knowledge_base_articles` WHERE `id` = OLD.`article_id`)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_published_version_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_published_versions_no_update`
BEFORE UPDATE ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_published_version_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_created_event`
AFTER INSERT ON `knowledge_base_article_versions`
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`article_id`,NEW.`id`,NEW.`created_by_user_id`,'draft_created',NULL,'draft',NEW.`content_sha256`,json_object('versionNumber',NEW.`version_number`,'hashVersion',NEW.`content_hash_version`),NEW.`created_at`);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_draft_update_guard`
BEFORE UPDATE OF `title_ru`,`title_uz`,`title_en`,`summary_ru`,`summary_uz`,`summary_en`,`body_ru_json`,`body_uz_json`,`body_en_json`,`related_slugs_json`,`content_sha256`,`content_hash_version` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL AND (NEW.`updated_by_user_id` IS NULL OR NEW.`updated_at` IS NULL OR NEW.`updated_at` = OLD.`updated_at` OR NEW.`content_hash_version` <> 'full-v2')
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_draft_update_evidence_required');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_draft_updated_event`
AFTER UPDATE OF `title_ru`,`title_uz`,`title_en`,`summary_ru`,`summary_uz`,`summary_en`,`body_ru_json`,`body_uz_json`,`body_en_json`,`related_slugs_json`,`content_sha256`,`content_hash_version` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`article_id`,NEW.`id`,NEW.`updated_by_user_id`,'draft_updated','draft','draft',NEW.`content_sha256`,json_object('versionNumber',NEW.`version_number`,'hashVersion',NEW.`content_hash_version`),NEW.`updated_at`);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_new_actor_guard`
BEFORE INSERT ON `knowledge_base_article_versions`
WHEN NEW.`created_by_user_id` IS NULL OR NEW.`updated_by_user_id` IS NULL OR NEW.`updated_at` IS NULL OR NEW.`content_hash_version` <> 'full-v2'
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_version_actor_required');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_no_delete`
BEFORE DELETE ON `knowledge_base_article_versions`
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_version_delete_forbidden');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_publish_guard`
BEFORE UPDATE OF `published_at` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL AND NEW.`published_at` IS NOT NULL AND NEW.`published_by_user_id` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_publication_actor_required');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_published_event`
AFTER UPDATE OF `published_at` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL AND NEW.`published_at` IS NOT NULL
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`article_id`,NEW.`id`,NEW.`published_by_user_id`,'published','draft','published',NEW.`content_sha256`,json_object('versionNumber',NEW.`version_number`,'hashVersion',NEW.`content_hash_version`),NEW.`published_at`);
END;
--> statement-breakpoint
ALTER TABLE `subscription_plan_versions` ADD COLUMN `name_en` text;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `title_en` text;
--> statement-breakpoint
ALTER TABLE `legal_service_proposals` ADD COLUMN `title_en` text;
--> statement-breakpoint
ALTER TABLE `legal_service_proposals` ADD COLUMN `scope_en` text;
--> statement-breakpoint
ALTER TABLE `legal_service_proposals` ADD COLUMN `duration_description_en` text;
--> statement-breakpoint
ALTER TABLE `proposal_milestones` ADD COLUMN `title_en` text;
--> statement-breakpoint
ALTER TABLE `system_status_incidents` ADD COLUMN `title_en` text
  CONSTRAINT `system_status_incident_title_en_check`
  CHECK (`title_en` IS NULL OR length(trim(`title_en`)) BETWEEN 3 AND 140);
--> statement-breakpoint
ALTER TABLE `system_status_incidents` ADD COLUMN `summary_en` text
  CONSTRAINT `system_status_incident_summary_en_check`
  CHECK (`summary_en` IS NULL OR length(trim(`summary_en`)) BETWEEN 10 AND 2000);
--> statement-breakpoint
ALTER TABLE `system_status_updates` ADD COLUMN `message_en` text
  CONSTRAINT `system_status_update_message_en_check`
  CHECK (`message_en` IS NULL OR length(trim(`message_en`)) BETWEEN 10 AND 2000);
--> statement-breakpoint
DROP TRIGGER `system_status_incident_update_guard`;
--> statement-breakpoint
CREATE TRIGGER `system_status_incident_update_guard`
BEFORE UPDATE ON `system_status_incidents`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`public_reference`<>OLD.`public_reference`
  OR NEW.`severity`<>OLD.`severity`
  OR NEW.`title_ru`<>OLD.`title_ru`
  OR NEW.`title_uz`<>OLD.`title_uz`
  OR NEW.`title_en` IS NOT OLD.`title_en`
  OR NEW.`summary_ru`<>OLD.`summary_ru`
  OR NEW.`summary_uz`<>OLD.`summary_uz`
  OR NEW.`summary_en` IS NOT OLD.`summary_en`
  OR NEW.`started_at`<>OLD.`started_at`
  OR NEW.`created_by_user_id`<>OLD.`created_by_user_id`
  OR NEW.`created_at`<>OLD.`created_at`
  OR NOT (
    (OLD.`state`='investigating' AND NEW.`state` IN ('identified','monitoring','resolved'))
    OR (OLD.`state`='identified' AND NEW.`state` IN ('monitoring','resolved'))
    OR (OLD.`state`='monitoring' AND NEW.`state`='resolved')
  )
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_INCIDENT_UPDATE_FORBIDDEN');
END;
--> statement-breakpoint
CREATE TRIGGER `account_deletion_requests_verification_guard`
BEFORE INSERT ON `account_deletion_requests`
WHEN NEW.`verification_challenge_id` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `account_deletion_challenges`
		WHERE `id` = NEW.`verification_challenge_id`
			AND `user_id` = NEW.`user_id`
			AND `session_id` = NEW.`requested_session_id`
			AND `consumed_at` = NEW.`verified_at`
			AND `consumed_by_operation_id` IS NOT NULL
			AND NEW.`verification_method` = 'email_otp'
	)
BEGIN
	SELECT RAISE(ABORT, 'account_deletion_requests verification mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `builder_version_writes_insert_guard` BEFORE INSERT ON `builder_document_version_object_writes`
WHEN NEW.`status`<>'pending' OR NEW.`version_id` IS NOT NULL OR NEW.`attempt_count`<>0 OR NEW.`last_error_code` IS NOT NULL OR NEW.`reconciled_at` IS NOT NULL
	OR NOT EXISTS (SELECT 1 FROM `workspace_members` member JOIN `documents` document ON document.`workspace_id`=member.`workspace_id` WHERE member.`workspace_id`=NEW.`workspace_id` AND member.`user_id`=NEW.`owner_user_id` AND member.`status`='active' AND document.`id`=NEW.`document_id` AND document.`workspace_id`=NEW.`workspace_id` AND document.`owner_user_id`=NEW.`owner_user_id` AND document.`revision`=NEW.`source_revision` AND document.`archived_at` IS NULL)
	OR NEW.`r2_key` NOT LIKE 'builder-document-versions/' || NEW.`workspace_id` || '/' || NEW.`document_id` || '/' || NEW.`id` || '-%'
	OR (NEW.`source`='suggestion' AND NOT EXISTS (SELECT 1 FROM `document_change_proposals` proposal WHERE proposal.`id`=NEW.`source_entity_id` AND proposal.`document_id`=NEW.`document_id` AND proposal.`status`='pending' AND proposal.`old_text`<>proposal.`new_text`))
	OR (NEW.`source`='analysis_correction' AND NOT EXISTS (SELECT 1 FROM `builder_document_analysis_handoffs` handoff JOIN `analysis_document_versions` version ON version.`analysis_id`=handoff.`analysis_id` WHERE version.`id`=NEW.`source_entity_id` AND version.`workspace_id`=NEW.`workspace_id` AND version.`owner_user_id`=NEW.`owner_user_id` AND version.`source_kind`='corrected' AND handoff.`document_id`=NEW.`document_id` AND handoff.`status`='ready'))
BEGIN SELECT RAISE(ABORT,'BUILDER_VERSION_WRITE_SOURCE_MISMATCH'); END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_identity_update_guard`
BEFORE UPDATE OF `slug`,`category` ON `knowledge_base_articles`
WHEN (OLD.`slug` <> NEW.`slug` OR OLD.`category` <> NEW.`category`) AND (
  NEW.`updated_by_user_id` IS NULL OR NEW.`updated_at` = OLD.`updated_at`
  OR EXISTS (SELECT 1 FROM `knowledge_base_article_versions` WHERE `article_id`=OLD.`id` AND `published_at` IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_article_identity_immutable_or_actor_missing');
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_status_guard`
BEFORE UPDATE OF `status` ON `knowledge_base_articles`
WHEN OLD.`status` <> NEW.`status` AND (
  NEW.`status_changed_by_user_id` IS NULL OR NEW.`status_changed_at` IS NULL
  OR NEW.`status_changed_at` IS OLD.`status_changed_at`
  OR (NEW.`status`='published' AND NOT EXISTS (SELECT 1 FROM `knowledge_base_article_versions` WHERE `article_id`=NEW.`id` AND `published_at` IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_article_status_evidence_required');
END;
--> statement-breakpoint
DROP TABLE `__v0154_shadow_id_guard`;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
