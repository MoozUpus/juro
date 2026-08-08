CREATE TABLE `lawyer_request_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`lawyer_request_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lawyer_request_messages_request_idx` ON `lawyer_request_messages` (`lawyer_request_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `lawyer_request_messages_author_idx` ON `lawyer_request_messages` (`author_user_id`,`created_at`);