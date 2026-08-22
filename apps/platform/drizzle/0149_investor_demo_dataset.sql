CREATE TABLE `investor_demo_accounts` (
  `account_key` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `dataset_version` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `synthetic_disclosure` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`account_key` IN ('client_demo','lawyer_demo','admin_demo')),
  CHECK (`status` IN ('active','disabled')),
  CHECK (`dataset_version` > 0),
  CHECK (length(trim(`synthetic_disclosure`)) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investor_demo_accounts_user_uidx`
  ON `investor_demo_accounts` (`user_id`);
--> statement-breakpoint
CREATE INDEX `investor_demo_accounts_status_idx`
  ON `investor_demo_accounts` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `investor_demo_dataset_events` (
  `id` text PRIMARY KEY NOT NULL,
  `dataset_version` integer NOT NULL,
  `event_type` text NOT NULL,
  `actor_user_id` text,
  `summary_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (`dataset_version` > 0),
  CHECK (`event_type` IN ('seeded','reset','disabled'))
);
--> statement-breakpoint
CREATE INDEX `investor_demo_dataset_events_version_idx`
  ON `investor_demo_dataset_events` (`dataset_version`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `investor_demo_dataset_events_no_update`
BEFORE UPDATE ON `investor_demo_dataset_events`
BEGIN
  SELECT RAISE(ABORT,'INVESTOR_DEMO_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `investor_demo_dataset_events_no_delete`
BEFORE DELETE ON `investor_demo_dataset_events`
BEGIN
  SELECT RAISE(ABORT,'INVESTOR_DEMO_EVENT_IMMUTABLE');
END;
