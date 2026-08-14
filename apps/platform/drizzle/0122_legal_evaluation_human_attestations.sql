-- A reviewer attestation is distinct from an AI annotation and binds exactly
-- one completed evaluation scope to a fresh-MFA legal reviewer.
CREATE TABLE `legal_evaluation_human_attestations` (
  `id` text PRIMARY KEY NOT NULL,
  `evaluation_run_id` text NOT NULL,
  `corpus_version` text NOT NULL,
  `scope_digest` text NOT NULL,
  `scenario_count` integer NOT NULL,
  `completed_run_count` integer NOT NULL,
  `disposition` text NOT NULL,
  `reviewer_user_id` text NOT NULL,
  `reviewer_session_id` text NOT NULL,
  `reviewer_assignment_id` text NOT NULL,
  `reviewer_mfa_verified_at` text NOT NULL,
  `previous_hash` text NOT NULL,
  `event_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`reviewer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`reviewer_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `legal_eval_human_disposition_check` CHECK (`disposition` IN ('confirmed_correct','needs_follow_up')),
  CONSTRAINT `legal_eval_human_count_check` CHECK (`scenario_count` BETWEEN 1 AND 10000 AND `completed_run_count`=`scenario_count`),
  CONSTRAINT `legal_eval_human_scope_hash_check` CHECK (length(`scope_digest`)=64 AND `scope_digest` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_previous_hash_check` CHECK (length(`previous_hash`)=64 AND `previous_hash` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_event_hash_check` CHECK (length(`event_hash`)=64 AND `event_hash` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_mfa_time_check` CHECK (`reviewer_mfa_verified_at`<=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_eval_human_scope_reviewer_uidx`
ON `legal_evaluation_human_attestations` (`evaluation_run_id`,`scope_digest`,`reviewer_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_eval_human_event_hash_uidx`
ON `legal_evaluation_human_attestations` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_eval_human_chain_uidx`
ON `legal_evaluation_human_attestations` (`reviewer_user_id`,`previous_hash`);
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_chain_guard`
BEFORE INSERT ON `legal_evaluation_human_attestations`
WHEN (NOT EXISTS (SELECT 1 FROM `legal_evaluation_human_attestations` WHERE `reviewer_user_id`=NEW.`reviewer_user_id`) AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000')
  OR (EXISTS (SELECT 1 FROM `legal_evaluation_human_attestations` WHERE `reviewer_user_id`=NEW.`reviewer_user_id`) AND NOT EXISTS (SELECT 1 FROM `legal_evaluation_human_attestations` parent WHERE parent.`reviewer_user_id`=NEW.`reviewer_user_id` AND parent.`event_hash`=NEW.`previous_hash` AND NOT EXISTS (SELECT 1 FROM `legal_evaluation_human_attestations` child WHERE child.`reviewer_user_id`=parent.`reviewer_user_id` AND child.`previous_hash`=parent.`event_hash`)))
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_CHAIN_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_actor_guard`
BEFORE INSERT ON `legal_evaluation_human_attestations`
WHEN NOT EXISTS (
  SELECT 1 FROM `auth_sessions` session
  JOIN `platform_staff_assignments` assignment ON assignment.`id`=NEW.`reviewer_assignment_id` AND assignment.`user_id`=NEW.`reviewer_user_id`
  LEFT JOIN `auth_devices` device ON device.`id`=session.`device_id`
  WHERE session.`id`=NEW.`reviewer_session_id` AND session.`user_id`=NEW.`reviewer_user_id`
    AND session.`revoked_at` IS NULL AND session.`assurance_level`='mfa' AND session.`mfa_verified_at`=NEW.`reviewer_mfa_verified_at`
    AND unixepoch(NEW.`created_at`)-unixepoch(session.`mfa_verified_at`) BETWEEN 0 AND 900
    AND session.`expires_at`>NEW.`created_at` AND coalesce(session.`idle_expires_at`,session.`expires_at`)>NEW.`created_at`
    AND (session.`device_id` IS NULL OR (device.`id` IS NOT NULL AND device.`revoked_at` IS NULL))
    AND assignment.`role`='legal_reviewer' AND assignment.`granted_at`<=NEW.`created_at` AND assignment.`expires_at`>NEW.`created_at` AND assignment.`revoked_at` IS NULL
    AND EXISTS (SELECT 1 FROM `auth_totp_credentials` totp WHERE totp.`user_id`=NEW.`reviewer_user_id` AND totp.`status`='active' AND totp.`verified_at` IS NOT NULL AND totp.`verified_at`<=NEW.`reviewer_mfa_verified_at` AND totp.`disabled_at` IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_ACCESS_DENIED');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_no_update`
BEFORE UPDATE ON `legal_evaluation_human_attestations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_no_delete`
BEFORE DELETE ON `legal_evaluation_human_attestations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_IMMUTABLE'); END;
