-- Migration 0065: short-lived guest AI sessions. Questions and answers are encrypted; no
-- plaintext legal content is stored.
-- Expand-only; production remains disabled by GUEST_AI_ENABLED=false.
CREATE TABLE `guest_ai_sessions` (
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
  CONSTRAINT `guest_ai_sessions_locale_check` CHECK(`locale` IN ('ru','uz')),
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
);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_ai_sessions_token_uidx` ON `guest_ai_sessions` (`token_hmac`);--> statement-breakpoint
CREATE INDEX `guest_ai_sessions_ip_created_idx` ON `guest_ai_sessions` (`ip_hmac`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_ai_sessions_expiry_idx` ON `guest_ai_sessions` (`expires_at`,`state`);--> statement-breakpoint

CREATE TABLE `guest_ai_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `correlation_id` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `provider_response_id` text,
  `fallback_from_provider` text,
  `status` text DEFAULT 'processing' NOT NULL,
  `response_kind` text,
  `request_ciphertext` text NOT NULL,
  `request_iv` text NOT NULL,
  `request_key_version` text NOT NULL,
  `result_ciphertext` text,
  `result_iv` text,
  `result_key_version` text,
  `legal_database_as_of` text NOT NULL,
  `instruction_hash` text NOT NULL,
  `source_version_hash` text NOT NULL,
  `input_tokens` integer DEFAULT 0 NOT NULL,
  `output_tokens` integer DEFAULT 0 NOT NULL,
  `cached_input_tokens` integer DEFAULT 0 NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `latency_ms` integer,
  `error_code` text,
  `expires_at` text NOT NULL,
  `started_at` text NOT NULL,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `guest_ai_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `guest_ai_runs_status_check` CHECK(`status` IN ('processing','completed','failed','expired')),
  CONSTRAINT `guest_ai_runs_response_kind_check` CHECK(`response_kind` IS NULL OR `response_kind` IN ('answer','clarification_required')),
  CONSTRAINT `guest_ai_runs_request_hash_check` CHECK(length(`request_hash`)=64),
  CONSTRAINT `guest_ai_runs_result_check` CHECK(
    (`status`='completed' AND `response_kind` IS NOT NULL AND `result_ciphertext` IS NOT NULL AND `result_iv` IS NOT NULL AND `result_key_version` IS NOT NULL AND `completed_at` IS NOT NULL)
    OR (`status`<>'completed' AND `response_kind` IS NULL AND `result_ciphertext` IS NULL AND `result_iv` IS NULL AND `result_key_version` IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_ai_runs_session_idempotency_uidx` ON `guest_ai_runs` (`session_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `guest_ai_runs_session_created_idx` ON `guest_ai_runs` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_ai_runs_expiry_idx` ON `guest_ai_runs` (`expires_at`,`status`);
