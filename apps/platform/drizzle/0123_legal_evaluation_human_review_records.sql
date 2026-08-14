-- Materialized per-scenario decisions are derived only from a prior, immutable
-- human attestation. They are not user feedback and do not contain raw answers.
CREATE TABLE `legal_evaluation_human_review_records` (
  `id` text PRIMARY KEY NOT NULL,
  `attestation_id` text NOT NULL,
  `evaluation_run_id` text NOT NULL,
  `corpus_version` text NOT NULL,
  `scenario_id` text NOT NULL,
  `attempt_id` text NOT NULL,
  `ai_run_id` text NOT NULL,
  `prompt_sha256` text NOT NULL,
  `response_sha256` text NOT NULL,
  `classification` text NOT NULL,
  `reviewer_user_id` text NOT NULL,
  `reviewer_session_id` text NOT NULL,
  `reviewer_assignment_id` text NOT NULL,
  `reviewer_mfa_verified_at` text NOT NULL,
  `materialization_reason` text NOT NULL,
  `previous_hash` text NOT NULL,
  `event_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`attestation_id`) REFERENCES `legal_evaluation_human_attestations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`reviewer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`reviewer_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `legal_eval_human_record_classification_check` CHECK (`classification`='correct'),
  CONSTRAINT `legal_eval_human_record_reason_check` CHECK (`materialization_reason`='attestation_scope_materialization'),
  CONSTRAINT `legal_eval_human_record_prompt_hash_check` CHECK (length(`prompt_sha256`)=64 AND `prompt_sha256` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_record_response_hash_check` CHECK (length(`response_sha256`)=64 AND `response_sha256` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_record_previous_hash_check` CHECK (length(`previous_hash`)=64 AND `previous_hash` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_record_event_hash_check` CHECK (length(`event_hash`)=64 AND `event_hash` NOT GLOB '*[^A-F0-9]*'),
  CONSTRAINT `legal_eval_human_record_mfa_time_check` CHECK (`reviewer_mfa_verified_at`<=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_eval_human_record_scope_uidx`
ON `legal_evaluation_human_review_records` (`evaluation_run_id`,`scenario_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_eval_human_record_event_hash_uidx`
ON `legal_evaluation_human_review_records` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_eval_human_record_chain_uidx`
ON `legal_evaluation_human_review_records` (`reviewer_user_id`,`previous_hash`);
--> statement-breakpoint
CREATE INDEX `legal_eval_human_record_attestation_idx`
ON `legal_evaluation_human_review_records` (`attestation_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_record_chain_guard`
BEFORE INSERT ON `legal_evaluation_human_review_records`
WHEN (NOT EXISTS (SELECT 1 FROM `legal_evaluation_human_review_records` WHERE `reviewer_user_id`=NEW.`reviewer_user_id`)
  AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000')
  OR (EXISTS (SELECT 1 FROM `legal_evaluation_human_review_records` WHERE `reviewer_user_id`=NEW.`reviewer_user_id`)
    AND NOT EXISTS (
      SELECT 1 FROM `legal_evaluation_human_review_records` parent
      WHERE parent.`reviewer_user_id`=NEW.`reviewer_user_id` AND parent.`event_hash`=NEW.`previous_hash`
        AND NOT EXISTS (
          SELECT 1 FROM `legal_evaluation_human_review_records` child
          WHERE child.`reviewer_user_id`=parent.`reviewer_user_id` AND child.`previous_hash`=parent.`event_hash`
        )
    ))
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_RECORD_CHAIN_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_record_attestation_guard`
BEFORE INSERT ON `legal_evaluation_human_review_records`
WHEN NOT EXISTS (
  SELECT 1 FROM `legal_evaluation_human_attestations` attestation
  WHERE attestation.`id`=NEW.`attestation_id`
    AND attestation.`evaluation_run_id`=NEW.`evaluation_run_id`
    AND attestation.`corpus_version`=NEW.`corpus_version`
    AND attestation.`disposition`='confirmed_correct'
    AND attestation.`reviewer_user_id`=NEW.`reviewer_user_id`
    AND attestation.`scenario_count`=314
    AND attestation.`completed_run_count`=314
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_RECORD_ATTESTATION_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_record_attempt_guard`
BEFORE INSERT ON `legal_evaluation_human_review_records`
WHEN NOT EXISTS (
  SELECT 1 FROM `staging_legal_evaluation_attempts` attempt
  WHERE attempt.`id`=NEW.`attempt_id`
    AND attempt.`evaluation_run_id`=NEW.`evaluation_run_id`
    AND attempt.`scenario_id`=NEW.`scenario_id`
    AND attempt.`ai_run_id`=NEW.`ai_run_id`
    AND upper(attempt.`prompt_sha256`)=NEW.`prompt_sha256`
    AND upper(attempt.`response_sha256`)=NEW.`response_sha256`
    AND attempt.`status`='completed'
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_RECORD_ATTEMPT_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_record_actor_guard`
BEFORE INSERT ON `legal_evaluation_human_review_records`
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
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_RECORD_ACCESS_DENIED'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_record_no_update`
BEFORE UPDATE ON `legal_evaluation_human_review_records`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_eval_human_record_no_delete`
BEFORE DELETE ON `legal_evaluation_human_review_records`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVALUATION_HUMAN_RECORD_IMMUTABLE'); END;
