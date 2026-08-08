CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`backup_type` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`schema_version` text,
	`app_version` text,
	`source_bookmark` text,
	`object_key` text,
	`checksum_sha256` text,
	`byte_size` integer,
	`manifest_version` text,
	`verified_at` text,
	`restore_tested_at` text,
	`error_code` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_runs_environment_idx` ON `backup_runs` (`environment`,`created_at`);--> statement-breakpoint
CREATE INDEX `backup_runs_status_idx` ON `backup_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `cleanup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`policy_version` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`dry_run` integer DEFAULT true NOT NULL,
	`cursor` text,
	`scanned_count` integer DEFAULT 0 NOT NULL,
	`deleted_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cleanup_runs_environment_idx` ON `cleanup_runs` (`environment`,`created_at`);--> statement-breakpoint
CREATE INDEX `cleanup_runs_status_idx` ON `cleanup_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`result_ref` text,
	`expires_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_expiry_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_status_idx` ON `idempotency_keys` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `job_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_binding` text NOT NULL,
	`job_type` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`idempotency_key` text NOT NULL,
	`subject_id` text NOT NULL,
	`workspace_id` text,
	`correlation_id` text NOT NULL,
	`enqueued_at` text NOT NULL,
	`available_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dispatch_attempts` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`next_attempt_at` text,
	`dispatched_at` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_outbox_idempotency_uidx` ON `job_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_outbox_status_idx` ON `job_outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `job_outbox_lease_idx` ON `job_outbox` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `job_outbox_workspace_idx` ON `job_outbox` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_name` text NOT NULL,
	`message_id` text NOT NULL,
	`job_type` text NOT NULL,
	`schema_version` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`subject_id` text NOT NULL,
	`workspace_id` text,
	`correlation_id` text NOT NULL,
	`envelope_hash` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`next_attempt_at` text,
	`error_code` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_idempotency_uidx` ON `job_runs` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_message_uidx` ON `job_runs` (`queue_name`,`message_id`);--> statement-breakpoint
CREATE INDEX `job_runs_status_idx` ON `job_runs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `job_runs_lease_idx` ON `job_runs` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `job_runs_workspace_idx` ON `job_runs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `scheduled_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`holder_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scheduled_locks_expiry_idx` ON `scheduled_locks` (`expires_at`);--> statement-breakpoint
CREATE TABLE `scheduled_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_name` text NOT NULL,
	`cron` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`holder_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`error_code` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_runs_idempotency_uidx` ON `scheduled_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `scheduled_runs_schedule_idx` ON `scheduled_runs` (`schedule_name`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `scheduled_runs_status_idx` ON `scheduled_runs` (`status`,`updated_at`);