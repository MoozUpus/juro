ALTER TABLE `lawyer_profiles` ADD COLUMN `marketplace_status` text DEFAULT 'profile_incomplete' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `city` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `region` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `education` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `consultation_formats_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `profile_photo_key` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `profile_photo_mime` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `profile_photo_sha256` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `profile_photo_size_bytes` integer;
--> statement-breakpoint
UPDATE `lawyer_profiles`
SET `marketplace_status`=CASE
  WHEN `status`='public_approved' THEN 'public_approved'
  WHEN `status`='rejected' THEN 'rejected'
  ELSE 'profile_incomplete'
END;
--> statement-breakpoint
CREATE INDEX `lawyer_profiles_marketplace_status_idx`
ON `lawyer_profiles` (`marketplace_status`,`status`,`updated_at`);
