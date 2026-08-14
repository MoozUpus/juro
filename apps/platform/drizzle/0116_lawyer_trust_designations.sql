-- Marketplace publication and the higher-trust JURO / Top Lawyer designations
-- are deliberately independent. A published profile is not implicitly promoted.
ALTER TABLE `lawyer_profiles` ADD COLUMN `juro_approval_status` text DEFAULT 'not_approved' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `juro_approved_at` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `juro_approved_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `top_lawyer_status` text DEFAULT 'not_featured' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `top_lawyer_criteria` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `top_lawyer_at` text;
--> statement-breakpoint
CREATE INDEX `lawyer_profiles_trust_designations_idx`
ON `lawyer_profiles` (`juro_approval_status`,`top_lawyer_status`,`marketplace_status`);
--> statement-breakpoint
CREATE TABLE `lawyer_profile_trust_designations` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `moderator_user_id` text NOT NULL,
  `designation` text NOT NULL,
  `decision` text NOT NULL,
  `reason` text NOT NULL,
  `criteria` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`moderator_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `lawyer_profile_trust_designation_kind_check` CHECK (`designation` IN ('juro_approval','top_lawyer')),
  CONSTRAINT `lawyer_profile_trust_designation_decision_check` CHECK (`decision` IN ('approved','revoked')),
  CONSTRAINT `lawyer_profile_trust_designation_reason_check` CHECK (length(trim(`reason`)) BETWEEN 1 AND 2000),
  CONSTRAINT `lawyer_profile_trust_designation_criteria_check` CHECK (`criteria` IS NULL OR length(trim(`criteria`)) BETWEEN 20 AND 1200)
);
--> statement-breakpoint
CREATE INDEX `lawyer_profile_trust_designations_profile_idx`
ON `lawyer_profile_trust_designations` (`lawyer_profile_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_trust_designations_append_only_update`
BEFORE UPDATE ON `lawyer_profile_trust_designations`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile trust designations are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_trust_designations_append_only_delete`
BEFORE DELETE ON `lawyer_profile_trust_designations`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile trust designations are append-only');
END;
