-- Migration 0112: append-only, content-free dependency health evidence.
-- This table never stores a request, response, document, URL payload, secret,
-- stack trace, or user identifier. "stale" is usually derived at read time,
-- but remains allowed for an explicit operationally-audited observation.
CREATE TABLE `dependency_health_checks` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `dependency_key` text NOT NULL,
  `state` text NOT NULL,
  `checked_at` text NOT NULL,
  `latency_ms` integer,
  `safe_error_code` text,
  `evidence_kind` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `dependency_health_checks_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `dependency_health_checks_key_check` CHECK (`dependency_key` IN ('d1','private_r2','queues','queue_dlq','malware_scanner','openai','anthropic','resend','legal_source_sync','document_analysis','document_builder','lawyer_area')),
  CONSTRAINT `dependency_health_checks_state_check` CHECK (`state` IN ('operational','degraded','partial_outage','outage','maintenance','unknown','stale')),
  CONSTRAINT `dependency_health_checks_latency_check` CHECK (`latency_ms` IS NULL OR (`latency_ms`>=0 AND `latency_ms`<=60000)),
  CONSTRAINT `dependency_health_checks_safe_error_check` CHECK (`safe_error_code` IS NULL OR (length(`safe_error_code`) BETWEEN 3 AND 96 AND `safe_error_code` GLOB '[A-Z]*' AND `safe_error_code` NOT GLOB '*[^A-Z0-9_]*')),
  CONSTRAINT `dependency_health_checks_evidence_kind_check` CHECK (`evidence_kind` IN ('probe','synthetic_probe','scheduled_job','manual_verification','integration_event'))
);
--> statement-breakpoint
CREATE INDEX `dependency_health_checks_latest_idx`
ON `dependency_health_checks` (`environment`,`dependency_key`,`checked_at` DESC,`id` DESC);
--> statement-breakpoint
CREATE TRIGGER `dependency_health_checks_no_update`
BEFORE UPDATE ON `dependency_health_checks`
BEGIN
  SELECT RAISE(ABORT, 'DEPENDENCY_HEALTH_CHECK_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `dependency_health_checks_no_delete`
BEFORE DELETE ON `dependency_health_checks`
BEGIN
  SELECT RAISE(ABORT, 'DEPENDENCY_HEALTH_CHECK_APPEND_ONLY');
END;
