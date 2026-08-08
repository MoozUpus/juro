CREATE TABLE `advice_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `canonical_id` text NOT NULL,
  `locale` text NOT NULL,
  `source_url` text NOT NULL,
  `title` text NOT NULL,
  `status` text DEFAULT 'pending_review' NOT NULL,
  `current_version_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `advice_scenarios_source_uidx` ON `advice_scenarios` (`source_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `advice_scenarios_identity_uidx` ON `advice_scenarios` (`canonical_id`,`locale`);
--> statement-breakpoint
CREATE INDEX `advice_scenarios_status_idx` ON `advice_scenarios` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `scenario_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `scenario_id` text NOT NULL,
  `legal_source_version_id` text NOT NULL,
  `title` text NOT NULL,
  `summary_text` text NOT NULL,
  `content_sha256` text NOT NULL,
  `status` text DEFAULT 'pending_review' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`scenario_id`) REFERENCES `advice_scenarios`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`legal_source_version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenario_versions_source_version_uidx` ON `scenario_versions` (`legal_source_version_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenario_versions_hash_uidx` ON `scenario_versions` (`scenario_id`,`content_sha256`);
--> statement-breakpoint
CREATE INDEX `scenario_versions_scenario_idx` ON `scenario_versions` (`scenario_id`,`created_at`);