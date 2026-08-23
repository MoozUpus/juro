ALTER TABLE `lawyer_requests` ADD COLUMN `lawyer_decision_claim_id` text;
--> statement-breakpoint
ALTER TABLE `lawyer_requests` ADD COLUMN `lawyer_decision_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `lawyer_requests` ADD COLUMN `lawyer_decision_at` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_requests_decision_claim_uidx`
  ON `lawyer_requests` (`lawyer_decision_claim_id`)
  WHERE `lawyer_decision_claim_id` IS NOT NULL;
