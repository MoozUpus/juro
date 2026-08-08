CREATE TABLE `ai_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`assistant_message_id` text NOT NULL,
	`ai_run_id` text NOT NULL,
	`feedback_type` text NOT NULL,
	`comment` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_feedback_type_check" CHECK("ai_feedback"."feedback_type" IN ('helpful','not_helpful','wrong_norm','broken_link','outdated','incomplete','language','unsafe','ignored_facts'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_feedback_response_type_uidx` ON `ai_feedback` (`workspace_id`,`user_id`,`assistant_message_id`,`feedback_type`);--> statement-breakpoint
CREATE INDEX `ai_feedback_workspace_created_idx` ON `ai_feedback` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_feedback_ai_run_idx` ON `ai_feedback` (`ai_run_id`,`created_at`);