CREATE TABLE `legal_monitoring_metadata` (
  `id` text PRIMARY KEY NOT NULL,
  `canonical_url` text NOT NULL,
  `canonical_id` text,
  `locale` text NOT NULL,
  `act_title` text NOT NULL,
  `revision_date` text,
  `effective_at` text,
  `fingerprint` text NOT NULL,
  `http_status` integer NOT NULL,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `last_checked_at` text NOT NULL,
  `last_error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_monitoring_metadata_url_uidx` ON `legal_monitoring_metadata` (`canonical_url`);
--> statement-breakpoint
CREATE INDEX `legal_monitoring_metadata_checked_idx` ON `legal_monitoring_metadata` (`last_checked_at`);
--> statement-breakpoint
CREATE TABLE `legal_monitoring_change_events` (
  `id` text PRIMARY KEY NOT NULL,
  `metadata_id` text NOT NULL,
  `canonical_url` text NOT NULL,
  `act_title` text NOT NULL,
  `change_type` text NOT NULL,
  `fingerprint` text NOT NULL,
  `detected_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`metadata_id`) REFERENCES `legal_monitoring_metadata`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_monitoring_change_fingerprint_uidx` ON `legal_monitoring_change_events` (`metadata_id`,`fingerprint`);
--> statement-breakpoint
CREATE INDEX `legal_monitoring_change_detected_idx` ON `legal_monitoring_change_events` (`detected_at`);
