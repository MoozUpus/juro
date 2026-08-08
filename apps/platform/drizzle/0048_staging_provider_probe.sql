CREATE TABLE `staging_provider_probes` (
  `id` text PRIMARY KEY NOT NULL,
  `probe_key` text NOT NULL,
  `provider` text NOT NULL,
  `status` text NOT NULL,
  `model` text,
  `provider_response_id` text,
  `input_tokens` integer DEFAULT 0 NOT NULL,
  `output_tokens` integer DEFAULT 0 NOT NULL,
  `cached_input_tokens` integer DEFAULT 0 NOT NULL,
  `latency_ms` integer DEFAULT 0 NOT NULL,
  `error_code` text,
  `started_at` text NOT NULL,
  `finished_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`provider` IN ('openai','anthropic')),
  CHECK (`status` IN ('running','succeeded','failed')),
  CHECK (`input_tokens` >= 0),
  CHECK (`output_tokens` >= 0),
  CHECK (`cached_input_tokens` >= 0),
  CHECK (`latency_ms` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_provider_probes_key_provider_uidx` ON `staging_provider_probes` (`probe_key`,`provider`);
--> statement-breakpoint
CREATE INDEX `staging_provider_probes_status_idx` ON `staging_provider_probes` (`status`,`updated_at`);
