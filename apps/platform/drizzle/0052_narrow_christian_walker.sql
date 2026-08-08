CREATE TABLE `lawyer_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`lawyer_request_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`scope_description` text NOT NULL,
	`price_description` text NOT NULL,
	`duration_description` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`responded_by_user_id` text,
	`responded_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responded_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_offers_request_version_uidx` ON `lawyer_offers` (`lawyer_request_id`,`version`);--> statement-breakpoint
CREATE INDEX `lawyer_offers_request_status_idx` ON `lawyer_offers` (`lawyer_request_id`,`status`,`updated_at`);