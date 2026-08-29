-- Migration 0161: add the user-facing balanced legal-chat mode without
-- weakening the append-only, content-free AI SLO telemetry boundary.
DROP TRIGGER `ai_slo_telemetry_no_update`;
--> statement-breakpoint
DROP TRIGGER `ai_slo_telemetry_no_delete`;
--> statement-breakpoint
DROP INDEX `ai_slo_telemetry_correlation_uidx`;
--> statement-breakpoint
DROP INDEX `ai_slo_telemetry_window_idx`;
--> statement-breakpoint
DROP INDEX `ai_slo_telemetry_outcome_idx`;
--> statement-breakpoint
ALTER TABLE `ai_slo_telemetry_events` RENAME TO `ai_slo_telemetry_events_legacy`;
--> statement-breakpoint
CREATE TABLE `ai_slo_telemetry_events` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `correlation_hash` text NOT NULL,
  `request_kind` text NOT NULL,
  `auth_kind` text NOT NULL,
  `answer_mode` text NOT NULL,
  `reasoning_mode` text NOT NULL,
  `provider` text NOT NULL,
  `model` text,
  `outcome` text NOT NULL,
  `fallback` text NOT NULL,
  `auth_latency_ms` integer,
  `context_latency_ms` integer,
  `retrieval_latency_ms` integer,
  `provider_ttft_ms` integer,
  `provider_total_ms` integer,
  `validation_latency_ms` integer,
  `persistence_latency_ms` integer,
  `end_to_end_ms` integer NOT NULL,
  `first_useful_stage` text NOT NULL,
  `first_useful_latency_ms` integer,
  `first_useful_pass` integer NOT NULL,
  `full_response_pass` integer NOT NULL,
  `safe_error_code` text,
  `occurred_at` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `ai_slo_telemetry_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `ai_slo_telemetry_correlation_hash_check` CHECK (length(`correlation_hash`)=64 AND `correlation_hash` NOT GLOB '*[^a-f0-9]*'),
  CONSTRAINT `ai_slo_telemetry_request_kind_check` CHECK (`request_kind` IN ('legal_chat','staging_synthetic_probe')),
  CONSTRAINT `ai_slo_telemetry_auth_kind_check` CHECK (`auth_kind` IN ('authenticated','guest','system')),
  CONSTRAINT `ai_slo_telemetry_answer_mode_check` CHECK (`answer_mode` IN ('short','detailed')),
  CONSTRAINT `ai_slo_telemetry_reasoning_mode_check` CHECK (`reasoning_mode` IN ('fast','balanced','deep')),
  CONSTRAINT `ai_slo_telemetry_provider_check` CHECK (`provider` IN ('openai','anthropic','none')),
  CONSTRAINT `ai_slo_telemetry_model_check` CHECK (`model` IS NULL OR (length(`model`) BETWEEN 1 AND 120 AND `model` NOT GLOB '*[^A-Za-z0-9._:-]*')),
  CONSTRAINT `ai_slo_telemetry_outcome_check` CHECK (`outcome` IN ('completed','failed','timed_out','cancelled')),
  CONSTRAINT `ai_slo_telemetry_fallback_check` CHECK (`fallback` IN ('none','openai_to_anthropic','anthropic_to_openai')),
  CONSTRAINT `ai_slo_telemetry_outcome_error_check` CHECK ((`outcome`='completed' AND `safe_error_code` IS NULL) OR (`outcome`<>'completed' AND `safe_error_code` IS NOT NULL)),
  CONSTRAINT `ai_slo_telemetry_provider_shape_check` CHECK ((`provider`='none' AND `model` IS NULL AND `provider_ttft_ms` IS NULL AND `provider_total_ms` IS NULL) OR `provider`<>'none'),
  CONSTRAINT `ai_slo_telemetry_fallback_provider_check` CHECK ((`fallback`='none') OR (`fallback`='openai_to_anthropic' AND `provider`='anthropic') OR (`fallback`='anthropic_to_openai' AND `provider`='openai')),
  CONSTRAINT `ai_slo_telemetry_stage_check` CHECK (`first_useful_stage` IN ('none','auth','context','retrieval','preliminary','provider_validated','validation','persistence')),
  CONSTRAINT `ai_slo_telemetry_first_useful_shape_check` CHECK ((`first_useful_stage`='none' AND `first_useful_latency_ms` IS NULL) OR (`first_useful_stage`<>'none' AND `first_useful_latency_ms` IS NOT NULL)),
  CONSTRAINT `ai_slo_telemetry_first_useful_pass_check` CHECK (`first_useful_pass` IN (0,1)),
  CONSTRAINT `ai_slo_telemetry_full_response_pass_check` CHECK (`full_response_pass` IN (0,1)),
  CONSTRAINT `ai_slo_telemetry_latency_check` CHECK (`auth_latency_ms` IS NULL OR (`auth_latency_ms`>=0 AND `auth_latency_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_context_latency_check` CHECK (`context_latency_ms` IS NULL OR (`context_latency_ms`>=0 AND `context_latency_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_retrieval_latency_check` CHECK (`retrieval_latency_ms` IS NULL OR (`retrieval_latency_ms`>=0 AND `retrieval_latency_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_provider_ttft_check` CHECK (`provider_ttft_ms` IS NULL OR (`provider_ttft_ms`>=0 AND `provider_ttft_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_provider_total_check` CHECK (`provider_total_ms` IS NULL OR (`provider_total_ms`>=0 AND `provider_total_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_validation_latency_check` CHECK (`validation_latency_ms` IS NULL OR (`validation_latency_ms`>=0 AND `validation_latency_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_persistence_latency_check` CHECK (`persistence_latency_ms` IS NULL OR (`persistence_latency_ms`>=0 AND `persistence_latency_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_end_to_end_check` CHECK (`end_to_end_ms`>=0 AND `end_to_end_ms`<=1800000),
  CONSTRAINT `ai_slo_telemetry_first_useful_latency_check` CHECK (`first_useful_latency_ms` IS NULL OR (`first_useful_latency_ms`>=0 AND `first_useful_latency_ms`<=1800000)),
  CONSTRAINT `ai_slo_telemetry_safe_error_check` CHECK (`safe_error_code` IS NULL OR (length(`safe_error_code`) BETWEEN 3 AND 96 AND `safe_error_code` GLOB '[A-Z]*' AND `safe_error_code` NOT GLOB '*[^A-Z0-9_]*')),
  CONSTRAINT `ai_slo_telemetry_staging_probe_check` CHECK (`request_kind`<>'staging_synthetic_probe' OR `environment`='staging')
);
--> statement-breakpoint
INSERT INTO `ai_slo_telemetry_events` (
  `id`,`environment`,`correlation_hash`,`request_kind`,`auth_kind`,`answer_mode`,`reasoning_mode`,
  `provider`,`model`,`outcome`,`fallback`,`auth_latency_ms`,`context_latency_ms`,`retrieval_latency_ms`,
  `provider_ttft_ms`,`provider_total_ms`,`validation_latency_ms`,`persistence_latency_ms`,`end_to_end_ms`,
  `first_useful_stage`,`first_useful_latency_ms`,`first_useful_pass`,`full_response_pass`,`safe_error_code`,
  `occurred_at`,`created_at`
)
SELECT
  `id`,`environment`,`correlation_hash`,`request_kind`,`auth_kind`,`answer_mode`,`reasoning_mode`,
  `provider`,`model`,`outcome`,`fallback`,`auth_latency_ms`,`context_latency_ms`,`retrieval_latency_ms`,
  `provider_ttft_ms`,`provider_total_ms`,`validation_latency_ms`,`persistence_latency_ms`,`end_to_end_ms`,
  `first_useful_stage`,`first_useful_latency_ms`,`first_useful_pass`,`full_response_pass`,`safe_error_code`,
  `occurred_at`,`created_at`
FROM `ai_slo_telemetry_events_legacy`;
--> statement-breakpoint
DROP TABLE `ai_slo_telemetry_events_legacy`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_slo_telemetry_correlation_uidx`
ON `ai_slo_telemetry_events` (`environment`,`correlation_hash`);
--> statement-breakpoint
CREATE INDEX `ai_slo_telemetry_window_idx`
ON `ai_slo_telemetry_events` (`environment`,`request_kind`,`occurred_at` DESC,`id` DESC);
--> statement-breakpoint
CREATE INDEX `ai_slo_telemetry_outcome_idx`
ON `ai_slo_telemetry_events` (`environment`,`outcome`,`occurred_at` DESC,`id` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_slo_telemetry_no_update`
BEFORE UPDATE ON `ai_slo_telemetry_events`
BEGIN
  SELECT RAISE(ABORT, 'AI_SLO_TELEMETRY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_slo_telemetry_no_delete`
BEFORE DELETE ON `ai_slo_telemetry_events`
BEGIN
  SELECT RAISE(ABORT, 'AI_SLO_TELEMETRY_APPEND_ONLY');
END;
