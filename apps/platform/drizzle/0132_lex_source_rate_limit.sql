-- Distributed, host-wide pacing for official Lex.uz acquisition. The row is
-- shared by catalog discovery and document ingestion; production remains inert
-- while the corpus feature flags are disabled.
CREATE TABLE `legal_source_host_rate_limits` (
  `host` text PRIMARY KEY NOT NULL,
  `crawl_delay_ms` integer NOT NULL DEFAULT 0,
  `last_request_at` text,
  `next_allowed_at` text NOT NULL,
  `robots_observed_at` text,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_source_host_rate_limit_host_check` CHECK (`host`='lex.uz'),
  CONSTRAINT `legal_source_host_rate_limit_delay_check` CHECK (`crawl_delay_ms` BETWEEN 0 AND 60000)
);
--> statement-breakpoint
CREATE INDEX `legal_source_host_rate_limits_next_idx`
  ON `legal_source_host_rate_limits` (`next_allowed_at`);
