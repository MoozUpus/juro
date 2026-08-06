-- Migration 0107: bounded health history for the query-scoped direct source path.
-- No source document, HTML, excerpt, chunk, or embedding is stored here.
CREATE TABLE `legal_source_health_checks` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `source_kind` text NOT NULL,
  `status` text NOT NULL,
  `checked_at` text NOT NULL,
  `latency_ms` integer NOT NULL,
  `error_code` text,
  `endpoint_url` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_source_health_checks_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_source_health_checks_kind_check` CHECK (`source_kind` IN ('lex','advice')),
  CONSTRAINT `legal_source_health_checks_status_check` CHECK (`status` IN ('healthy','unavailable')),
  CONSTRAINT `legal_source_health_checks_latency_check` CHECK (`latency_ms`>=0 AND `latency_ms`<=60000),
  CONSTRAINT `legal_source_health_checks_endpoint_check` CHECK (`endpoint_url` IN ('https://lex.uz/robots.txt','https://advice.uz/robots.txt'))
);--> statement-breakpoint
CREATE INDEX `legal_source_health_checks_lookup_idx` ON `legal_source_health_checks` (`environment`,`source_kind`,`checked_at` DESC);--> statement-breakpoint
