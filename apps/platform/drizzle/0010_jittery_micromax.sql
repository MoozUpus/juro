CREATE TABLE `legislation_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title_original` text NOT NULL,
	`original_language` text NOT NULL,
	`title_ru` text,
	`title_uz` text,
	`summary_ru` text,
	`summary_uz` text,
	`change_summary_ru` text,
	`change_summary_uz` text,
	`recommended_action_ru` text,
	`recommended_action_uz` text,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`affected_audiences_json` text DEFAULT '[]' NOT NULL,
	`adopted_at` text,
	`effective_at` text,
	`published_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legislation_updates_source_uidx` ON `legislation_updates` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `legislation_updates_status_idx` ON `legislation_updates` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `monitoring_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`audience` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`channels_json` text DEFAULT '["in_app"]' NOT NULL,
	`frequency` text DEFAULT 'weekly' NOT NULL,
	`locale` text DEFAULT 'ru' NOT NULL,
	`document_impact_consent` integer DEFAULT false NOT NULL,
	`last_delivered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_preferences_user_workspace_uidx` ON `monitoring_preferences` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `monitoring_preferences_delivery_idx` ON `monitoring_preferences` (`frequency`,`last_delivered_at`);