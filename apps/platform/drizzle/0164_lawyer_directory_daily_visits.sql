-- Migration 0164: privacy-minimal, daily-deduplicated marketplace funnel evidence.
-- Rows contain only an internal user key and UTC observation timestamps. No
-- query, profile, case, contact, document, or other user content is stored.
CREATE TABLE `lawyer_directory_daily_visits` (
  `user_id` text NOT NULL,
  `visit_day` text NOT NULL,
  `first_viewed_at` text NOT NULL,
  `last_viewed_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`visit_day`),
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (length(`visit_day`) = 10),
  CHECK (`visit_day` = substr(`first_viewed_at`,1,10)),
  CHECK (`visit_day` = substr(`last_viewed_at`,1,10)),
  CHECK (`first_viewed_at` <= `last_viewed_at`)
);
--> statement-breakpoint
CREATE INDEX `lawyer_directory_daily_visits_first_viewed_idx`
ON `lawyer_directory_daily_visits` (`first_viewed_at`,`user_id`);
