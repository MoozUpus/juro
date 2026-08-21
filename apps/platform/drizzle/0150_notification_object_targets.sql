ALTER TABLE `notifications` ADD COLUMN `target_type` text;
--> statement-breakpoint
ALTER TABLE `notifications` ADD COLUMN `target_id` text;
--> statement-breakpoint
UPDATE `notifications`
SET `target_type`='document',`target_id`=`document_id`
WHERE `document_id` IS NOT NULL AND `target_type` IS NULL;
--> statement-breakpoint
CREATE INDEX `notifications_target_idx`
  ON `notifications` (`user_id`,`target_type`,`target_id`,`created_at`);
