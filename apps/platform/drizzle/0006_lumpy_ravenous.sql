ALTER TABLE `user_profiles` ADD `organization_role` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `primary_goal` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `timezone` text DEFAULT 'Asia/Tashkent' NOT NULL;