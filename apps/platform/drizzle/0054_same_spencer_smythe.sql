CREATE TABLE `lawyer_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`lawyer_request_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`lawyer_profile_id` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`overall_rating` integer NOT NULL,
	`speed_rating` integer NOT NULL,
	`quality_rating` integer NOT NULL,
	`communication_rating` integer NOT NULL,
	`body` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requester_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_reviews_request_uidx` ON `lawyer_reviews` (`lawyer_request_id`);--> statement-breakpoint
CREATE INDEX `lawyer_reviews_lawyer_status_idx` ON `lawyer_reviews` (`lawyer_profile_id`,`status`,`created_at`);