CREATE TABLE `lawyer_time_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `case_id` text NOT NULL,
  `lawyer_request_id` text NOT NULL,
  `source` text NOT NULL,
  `status` text NOT NULL,
  `description` text NOT NULL,
  `billable` integer DEFAULT 0 NOT NULL,
  `started_at` text NOT NULL,
  `ended_at` text,
  `duration_seconds` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`source` IN ('timer','manual')),
  CHECK (`status` IN ('running','completed')),
  CHECK (`billable` IN (0,1)),
  CHECK (length(trim(`description`)) BETWEEN 1 AND 500),
  CHECK (
    (`status`='running' AND `source`='timer' AND `ended_at` IS NULL AND `duration_seconds` IS NULL)
    OR (`status`='completed' AND `ended_at` IS NOT NULL AND `duration_seconds` BETWEEN 1 AND 604800)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_time_entries_one_running_uidx`
  ON `lawyer_time_entries` (`lawyer_user_id`) WHERE `status`='running';
--> statement-breakpoint
CREATE INDEX `lawyer_time_entries_case_idx`
  ON `lawyer_time_entries` (`lawyer_user_id`,`case_id`,`started_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_time_entries_identity_guard`
BEFORE UPDATE ON `lawyer_time_entries`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_user_id`<>OLD.`lawyer_user_id`
  OR NEW.`workspace_id`<>OLD.`workspace_id`
  OR NEW.`case_id`<>OLD.`case_id`
  OR NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`source`<>OLD.`source`
  OR NEW.`started_at`<>OLD.`started_at`
  OR NEW.`created_at`<>OLD.`created_at`
  OR OLD.`status`='completed'
BEGIN
  SELECT RAISE(ABORT,'LAWYER_TIME_ENTRY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_time_entries_no_delete`
BEFORE DELETE ON `lawyer_time_entries`
BEGIN
  SELECT RAISE(ABORT,'LAWYER_TIME_ENTRY_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_conflict_search_events` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `query_sha256` text NOT NULL,
  `result_count` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (length(`query_sha256`)=64),
  CHECK (`result_count` BETWEEN 0 AND 200)
);
--> statement-breakpoint
CREATE INDEX `lawyer_conflict_search_events_user_idx`
  ON `lawyer_conflict_search_events` (`lawyer_user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_conflict_search_events_no_update`
BEFORE UPDATE ON `lawyer_conflict_search_events`
BEGIN
  SELECT RAISE(ABORT,'LAWYER_CONFLICT_SEARCH_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_conflict_search_events_no_delete`
BEFORE DELETE ON `lawyer_conflict_search_events`
BEGIN
  SELECT RAISE(ABORT,'LAWYER_CONFLICT_SEARCH_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_knowledge_items` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `case_id` text,
  `client_user_id` text,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `source_url` text,
  `folder` text NOT NULL,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `favorite` integer DEFAULT 0 NOT NULL,
  `archived_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`client_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (`kind` IN ('ai_answer','legal_position','source','template','clause','monitoring','note','document')),
  CHECK (length(trim(`title`)) BETWEEN 2 AND 240),
  CHECK (length(trim(`content`)) BETWEEN 1 AND 20000),
  CHECK (length(trim(`folder`)) BETWEEN 1 AND 120),
  CHECK (`favorite` IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `lawyer_knowledge_items_user_idx`
  ON `lawyer_knowledge_items` (`lawyer_user_id`,`archived_at`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `lawyer_knowledge_items_case_idx`
  ON `lawyer_knowledge_items` (`lawyer_user_id`,`case_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `lawyer_knowledge_items_client_idx`
  ON `lawyer_knowledge_items` (`lawyer_user_id`,`client_user_id`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_knowledge_items_identity_guard`
BEFORE UPDATE ON `lawyer_knowledge_items`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_user_id`<>OLD.`lawyer_user_id`
  OR NEW.`workspace_id`<>OLD.`workspace_id`
  OR NEW.`client_user_id` IS NOT OLD.`client_user_id`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT,'LAWYER_KNOWLEDGE_IDENTITY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_knowledge_items_no_delete`
BEFORE DELETE ON `lawyer_knowledge_items`
BEGIN
  SELECT RAISE(ABORT,'LAWYER_KNOWLEDGE_ARCHIVE_REQUIRED');
END;
