CREATE TABLE `email_change_challenges` (
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
	CONSTRAINT "email_change_challenges_locale_check" CHECK("email_change_challenges"."locale" IN ('ru','uz')),
	CONSTRAINT "email_change_challenges_attempts_check" CHECK("email_change_challenges"."attempt_count" >= 0 AND "email_change_challenges"."attempt_count" <= "email_change_challenges"."max_attempts" AND "email_change_challenges"."max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_change_challenges_operation_uidx` ON `email_change_challenges` (`consumed_by_operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_change_challenges_active_user_uidx` ON `email_change_challenges` (`user_id`) WHERE "email_change_challenges"."consumed_at" IS NULL AND "email_change_challenges"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX `email_change_challenges_user_created_idx` ON `email_change_challenges` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_change_challenges_new_email_lookup_idx` ON `email_change_challenges` (`new_email_lookup_key_version`,`new_email_lookup_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_change_challenges_expiry_idx` ON `email_change_challenges` (`expires_at`);--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
CREATE TRIGGER `email_change_challenge_state_insert_guard`
BEFORE INSERT ON `email_change_challenges`
WHEN
  NEW.`consumed_at` IS NOT NULL
  OR NEW.`consumed_by_operation_id` IS NOT NULL
  OR NEW.`invalidated_at` IS NOT NULL
  OR NEW.`codes_queued_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'email change challenge initial state invalid');
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
