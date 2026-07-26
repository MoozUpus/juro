CREATE TABLE `document_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`uploaded_file_id` text NOT NULL,
	`status` text NOT NULL,
	`summary_json` text,
	`error_code` text,
	`consent_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_analyses_workspace_idx` ON `document_analyses` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_analyses_file_uidx` ON `document_analyses` (`uploaded_file_id`);--> statement-breakpoint
CREATE TABLE `document_risks` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`excerpt` text,
	`confidence_percent` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_risks_analysis_idx` ON `document_risks` (`analysis_id`,`level`);--> statement-breakpoint
ALTER TABLE `document_files` ADD `workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
CREATE INDEX `document_files_workspace_idx` ON `document_files` (`workspace_id`,`created_at`);--> statement-breakpoint
UPDATE `document_files`
SET `workspace_id` = (SELECT `default_workspace_id` FROM `user_profiles` WHERE `user_profiles`.`id` = `document_files`.`owner_user_id`)
WHERE `workspace_id` IS NULL;
