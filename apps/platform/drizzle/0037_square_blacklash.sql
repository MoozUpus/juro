CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`request_message_id` text,
	`response_message_id` text,
	`idempotency_key` text NOT NULL,
	`correlation_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`provider_response_id` text,
	`fallback_from_provider` text,
	`answer_mode` text NOT NULL,
	`reasoning_mode` text NOT NULL,
	`status` text NOT NULL,
	`legal_database_as_of` text NOT NULL,
	`instruction_hash` text NOT NULL,
	`source_version_hash` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_microusd` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`error_code` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`request_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`response_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runs_idempotency_uidx` ON `ai_runs` (`workspace_id`,`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ai_runs_workspace_status_idx` ON `ai_runs` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_conversation_idx` ON `ai_runs` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ai_run_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`feature` text DEFAULT 'legal_chat' NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_microusd` integer,
	`released_at` text,
	`consumed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_ledger_run_uidx` ON `ai_usage_ledger` (`ai_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_ledger_idempotency_uidx` ON `ai_usage_ledger` (`workspace_id`,`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ai_usage_ledger_period_idx` ON `ai_usage_ledger` (`workspace_id`,`user_id`,`feature`,`period_start`,`status`);