ALTER TABLE `user_profiles` ADD `last_name` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `middle_name` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_verified_at` text;