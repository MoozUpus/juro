ALTER TABLE `user_profiles`
  ADD COLUMN `theme_preference` text DEFAULT 'system' NOT NULL
  CHECK (`theme_preference` IN ('system','light','dark'));
--> statement-breakpoint
CREATE TABLE `lawyer_availability_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `weekday` integer NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `timezone` text DEFAULT 'Asia/Tashkent' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`weekday` BETWEEN 1 AND 7),
  CHECK (`starts_at` GLOB '[0-1][0-9]:[0-5][0-9]' OR `starts_at` GLOB '2[0-3]:[0-5][0-9]'),
  CHECK (`ends_at` GLOB '[0-1][0-9]:[0-5][0-9]' OR `ends_at` GLOB '2[0-3]:[0-5][0-9]'),
  CHECK (`starts_at` < `ends_at`),
  CHECK (`status` IN ('active','paused'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_availability_rules_slot_uidx`
  ON `lawyer_availability_rules` (`lawyer_profile_id`,`weekday`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `lawyer_availability_rules_profile_idx`
  ON `lawyer_availability_rules` (`lawyer_profile_id`,`status`,`weekday`);
--> statement-breakpoint
CREATE TABLE `lawyer_unavailability_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`starts_at` < `ends_at`)
);
--> statement-breakpoint
CREATE INDEX `lawyer_unavailability_periods_profile_idx`
  ON `lawyer_unavailability_periods` (`lawyer_profile_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE TABLE `lawyer_consultations` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_request_id` text NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `client_user_id` text NOT NULL,
  `case_id` text NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `timezone` text DEFAULT 'Asia/Tashkent' NOT NULL,
  `format` text DEFAULT 'video' NOT NULL,
  `status` text DEFAULT 'proposed' NOT NULL,
  `internal_note` text,
  `result_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`client_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`starts_at` < `ends_at`),
  CHECK (`format` IN ('video','phone','office')),
  CHECK (`status` IN ('proposed','confirmed','in_progress','completed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_consultations_request_uidx`
  ON `lawyer_consultations` (`lawyer_request_id`);
--> statement-breakpoint
CREATE INDEX `lawyer_consultations_lawyer_time_idx`
  ON `lawyer_consultations` (`lawyer_profile_id`,`starts_at`,`status`);
--> statement-breakpoint
CREATE INDEX `lawyer_consultations_client_time_idx`
  ON `lawyer_consultations` (`client_user_id`,`starts_at`,`status`);
