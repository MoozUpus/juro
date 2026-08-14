-- Staging-only retained evidence for the canonical legal-chat evaluation.
-- These rows identify synthetic runs and OpenAI Codex reviews explicitly;
-- they never impersonate the separate MFA-backed human legal-review ledger.
CREATE TABLE `staging_legal_evaluation_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `evaluation_run_id` text NOT NULL,
  `scenario_id` text NOT NULL,
  `attempt_number` integer NOT NULL,
  `corpus_version` text NOT NULL,
  `locale` text NOT NULL,
  `account_type` text NOT NULL,
  `prompt_sha256` text NOT NULL,
  `user_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `conversation_id` text,
  `ai_run_id` text,
  `status` text NOT NULL,
  `http_status` integer,
  `safe_error_code` text,
  `response_sha256` text,
  `worker_version_id` text NOT NULL,
  `worker_version_created_at` text NOT NULL,
  `started_at` text NOT NULL,
  `completed_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`ai_run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `staging_legal_eval_attempt_number_check` CHECK (`attempt_number` BETWEEN 1 AND 5),
  CONSTRAINT `staging_legal_eval_locale_check` CHECK (`locale` IN ('ru','uz')),
  CONSTRAINT `staging_legal_eval_account_check` CHECK (`account_type` IN ('individual','entrepreneur','lawyer')),
  CONSTRAINT `staging_legal_eval_status_check` CHECK (`status` IN ('running','completed','failed')),
  CONSTRAINT `staging_legal_eval_prompt_hash_check` CHECK (length(`prompt_sha256`)=64 AND lower(`prompt_sha256`)=`prompt_sha256`),
  CONSTRAINT `staging_legal_eval_response_hash_check` CHECK (`response_sha256` IS NULL OR (length(`response_sha256`)=64 AND lower(`response_sha256`)=`response_sha256`)),
  CONSTRAINT `staging_legal_eval_terminal_shape_check` CHECK (
    (`status`='running' AND `completed_at` IS NULL AND `http_status` IS NULL AND `response_sha256` IS NULL)
    OR (`status`='completed' AND `completed_at` IS NOT NULL AND `http_status` BETWEEN 200 AND 299 AND `ai_run_id` IS NOT NULL AND `response_sha256` IS NOT NULL AND `safe_error_code` IS NULL)
    OR (`status`='failed' AND `completed_at` IS NOT NULL AND `http_status` BETWEEN 400 AND 599 AND `safe_error_code` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_legal_eval_attempt_uidx`
ON `staging_legal_evaluation_attempts` (`evaluation_run_id`,`scenario_id`,`attempt_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_legal_eval_ai_run_uidx`
ON `staging_legal_evaluation_attempts` (`ai_run_id`) WHERE `ai_run_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `staging_legal_eval_run_status_idx`
ON `staging_legal_evaluation_attempts` (`evaluation_run_id`,`status`,`scenario_id`);
--> statement-breakpoint
CREATE TRIGGER `staging_legal_eval_attempt_transition_guard`
BEFORE UPDATE ON `staging_legal_evaluation_attempts`
WHEN OLD.`status`<>'running'
  OR NEW.`status` NOT IN ('completed','failed')
  OR NEW.`id`<>OLD.`id`
  OR NEW.`evaluation_run_id`<>OLD.`evaluation_run_id`
  OR NEW.`scenario_id`<>OLD.`scenario_id`
  OR NEW.`attempt_number`<>OLD.`attempt_number`
  OR NEW.`corpus_version`<>OLD.`corpus_version`
  OR NEW.`locale`<>OLD.`locale`
  OR NEW.`account_type`<>OLD.`account_type`
  OR NEW.`prompt_sha256`<>OLD.`prompt_sha256`
  OR NEW.`user_id`<>OLD.`user_id`
  OR NEW.`workspace_id`<>OLD.`workspace_id`
  OR NEW.`worker_version_id`<>OLD.`worker_version_id`
  OR NEW.`worker_version_created_at`<>OLD.`worker_version_created_at`
  OR NEW.`started_at`<>OLD.`started_at`
BEGIN
  SELECT RAISE(ABORT, 'STAGING_LEGAL_EVALUATION_ATTEMPT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `staging_legal_eval_attempt_no_delete`
BEFORE DELETE ON `staging_legal_evaluation_attempts`
BEGIN
  SELECT RAISE(ABORT, 'STAGING_LEGAL_EVALUATION_ATTEMPT_IMMUTABLE');
END;
--> statement-breakpoint

CREATE TABLE `staging_legal_evaluation_agent_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `evaluation_run_id` text NOT NULL,
  `scenario_id` text NOT NULL,
  `attempt_id` text NOT NULL,
  `ai_run_id` text NOT NULL,
  `reviewer_kind` text NOT NULL,
  `reviewer_id` text NOT NULL,
  `reviewer_task_id` text NOT NULL,
  `attestation` text NOT NULL,
  `classification` text NOT NULL,
  `language_quality` integer NOT NULL,
  `observed_behaviors_json` text NOT NULL,
  `metrics_json` text NOT NULL,
  `notes` text NOT NULL,
  `question_sha256` text NOT NULL,
  `answer_sha256` text NOT NULL,
  `previous_hash` text NOT NULL,
  `event_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`attempt_id`) REFERENCES `staging_legal_evaluation_attempts`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`ai_run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `staging_legal_eval_agent_kind_check` CHECK (`reviewer_kind`='openai_codex'),
  CONSTRAINT `staging_legal_eval_agent_attestation_check` CHECK (`attestation`='AI_REVIEW_NOT_HUMAN_LEGAL_APPROVAL'),
  CONSTRAINT `staging_legal_eval_agent_classification_check` CHECK (`classification` IN ('correct','partially_incorrect','incorrect','unsafe','outdated_source','broken_citation','insufficient_context','language_issue')),
  CONSTRAINT `staging_legal_eval_agent_language_check` CHECK (`language_quality` BETWEEN 0 AND 100),
  CONSTRAINT `staging_legal_eval_agent_question_hash_check` CHECK (length(`question_sha256`)=64 AND lower(`question_sha256`)=`question_sha256`),
  CONSTRAINT `staging_legal_eval_agent_answer_hash_check` CHECK (length(`answer_sha256`)=64 AND lower(`answer_sha256`)=`answer_sha256`),
  CONSTRAINT `staging_legal_eval_agent_previous_hash_check` CHECK (length(`previous_hash`)=64 AND lower(`previous_hash`)=`previous_hash`),
  CONSTRAINT `staging_legal_eval_agent_event_hash_check` CHECK (length(`event_hash`)=64 AND lower(`event_hash`)=`event_hash`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_legal_eval_agent_scenario_uidx`
ON `staging_legal_evaluation_agent_reviews` (`evaluation_run_id`,`scenario_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_legal_eval_agent_event_hash_uidx`
ON `staging_legal_evaluation_agent_reviews` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_legal_eval_agent_chain_uidx`
ON `staging_legal_evaluation_agent_reviews` (`reviewer_id`,`previous_hash`);
--> statement-breakpoint
CREATE TRIGGER `staging_legal_eval_agent_chain_guard`
BEFORE INSERT ON `staging_legal_evaluation_agent_reviews`
WHEN (
  NOT EXISTS (SELECT 1 FROM `staging_legal_evaluation_agent_reviews` WHERE `reviewer_id`=NEW.`reviewer_id`)
  AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000'
) OR (
  EXISTS (SELECT 1 FROM `staging_legal_evaluation_agent_reviews` WHERE `reviewer_id`=NEW.`reviewer_id`)
  AND NOT EXISTS (
    SELECT 1 FROM `staging_legal_evaluation_agent_reviews` parent
    WHERE parent.`reviewer_id`=NEW.`reviewer_id`
      AND parent.`event_hash`=NEW.`previous_hash`
      AND NOT EXISTS (
        SELECT 1 FROM `staging_legal_evaluation_agent_reviews` child
        WHERE child.`reviewer_id`=parent.`reviewer_id`
          AND child.`previous_hash`=parent.`event_hash`
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'STAGING_LEGAL_EVALUATION_AGENT_CHAIN_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `staging_legal_eval_agent_attempt_guard`
BEFORE INSERT ON `staging_legal_evaluation_agent_reviews`
WHEN NOT EXISTS (
  SELECT 1 FROM `staging_legal_evaluation_attempts` attempt
  JOIN `ai_runs` run ON run.`id`=attempt.`ai_run_id`
  JOIN `conversation_messages` question ON question.`id`=run.`request_message_id`
  JOIN `conversation_messages` answer ON answer.`id`=run.`response_message_id`
  WHERE attempt.`id`=NEW.`attempt_id`
    AND attempt.`evaluation_run_id`=NEW.`evaluation_run_id`
    AND attempt.`scenario_id`=NEW.`scenario_id`
    AND attempt.`ai_run_id`=NEW.`ai_run_id`
    AND attempt.`status`='completed'
    AND run.`status`='completed'
)
BEGIN
  SELECT RAISE(ABORT, 'STAGING_LEGAL_EVALUATION_AGENT_EVIDENCE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `staging_legal_eval_agent_no_update`
BEFORE UPDATE ON `staging_legal_evaluation_agent_reviews`
BEGIN
  SELECT RAISE(ABORT, 'STAGING_LEGAL_EVALUATION_AGENT_REVIEW_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `staging_legal_eval_agent_no_delete`
BEFORE DELETE ON `staging_legal_evaluation_agent_reviews`
BEGIN
  SELECT RAISE(ABORT, 'STAGING_LEGAL_EVALUATION_AGENT_REVIEW_IMMUTABLE');
END;
