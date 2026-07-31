CREATE TABLE `task_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`channel` text DEFAULT 'in_app' NOT NULL,
	`reminder_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text NOT NULL,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_reminders_idempotency_uidx` ON `task_reminders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `task_reminders_due_idx` ON `task_reminders` (`status`,`reminder_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`case_id` text NOT NULL,
	`plan_step_id` text,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`legal_basis` text,
	`source_date` text,
	`due_at` text,
	`safe_due_at` text,
	`calculation_method` text,
	`deadline_type` text DEFAULT 'calendar_days' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_step_id`) REFERENCES `action_plan_steps`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_plan_step_uidx` ON `tasks` (`plan_step_id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_due_idx` ON `tasks` (`workspace_id`,`due_at`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_case_idx` ON `tasks` (`case_id`,`updated_at`);