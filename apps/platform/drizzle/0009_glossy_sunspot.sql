CREATE TABLE `comparison_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`change_type` text NOT NULL,
	`before_section_id` text,
	`after_section_id` text,
	`before_label` text,
	`after_label` text,
	`before_heading` text,
	`after_heading` text,
	`before_text` text,
	`after_text` text,
	`word_diff_json` text NOT NULL,
	`summary` text NOT NULL,
	`legal_effect` text NOT NULL,
	`affected_party` text NOT NULL,
	`risk_effect` text NOT NULL,
	`risk_level` text NOT NULL,
	`recommendation` text NOT NULL,
	`source_ids_json` text DEFAULT '[]' NOT NULL,
	`confidence_percent` integer,
	`reviewed_at` text,
	`extraction_warning` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `document_comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comparison_changes_order_uidx` ON `comparison_changes` (`comparison_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `comparison_changes_type_idx` ON `comparison_changes` (`comparison_id`,`change_type`);--> statement-breakpoint
CREATE INDEX `comparison_changes_risk_idx` ON `comparison_changes` (`comparison_id`,`risk_level`,`risk_effect`);--> statement-breakpoint
CREATE TABLE `document_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`version_one_file_id` text NOT NULL,
	`version_two_file_id` text NOT NULL,
	`case_id` text,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`locale` text NOT NULL,
	`summary_json` text,
	`version_one_json_key` text,
	`version_two_json_key` text,
	`similarity_percent` integer,
	`overall_risk` text,
	`ai_status` text,
	`model_name` text,
	`model_version` text,
	`error_code` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_one_file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_two_file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `document_comparisons_workspace_idx` ON `document_comparisons` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `document_comparisons_owner_idx` ON `document_comparisons` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `document_comparisons_status_idx` ON `document_comparisons` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `document_files` ADD `sha256` text;