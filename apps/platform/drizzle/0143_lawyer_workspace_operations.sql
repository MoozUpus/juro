CREATE TABLE `lawyer_task_comments` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `author_user_id` text NOT NULL,
  `body` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (length(trim(`body`)) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `lawyer_task_comments_task_idx`
  ON `lawyer_task_comments` (`task_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_task_comments_no_update`
BEFORE UPDATE ON `lawyer_task_comments`
BEGIN
  SELECT RAISE(ABORT, 'lawyer task comments are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_task_comments_no_delete`
BEFORE DELETE ON `lawyer_task_comments`
BEGIN
  SELECT RAISE(ABORT, 'lawyer task comments are append-only');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_document_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_request_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `case_id` text NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `client_user_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `status` text DEFAULT 'requested' NOT NULL,
  `provided_document_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`client_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`provided_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (length(trim(`title`)) BETWEEN 2 AND 240),
  CHECK (length(trim(`description`)) BETWEEN 4 AND 2000),
  CHECK (`status` IN ('requested','provided','cancelled')),
  CHECK ((`status`='provided' AND `provided_document_id` IS NOT NULL) OR (`status`<>'provided' AND `provided_document_id` IS NULL))
);
--> statement-breakpoint
CREATE INDEX `lawyer_document_requests_request_idx`
  ON `lawyer_document_requests` (`lawyer_request_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `lawyer_document_requests_case_idx`
  ON `lawyer_document_requests` (`case_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_document_requests_immutable_fields`
BEFORE UPDATE ON `lawyer_document_requests`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`workspace_id`<>OLD.`workspace_id`
  OR NEW.`case_id`<>OLD.`case_id`
  OR NEW.`lawyer_user_id`<>OLD.`lawyer_user_id`
  OR NEW.`client_user_id`<>OLD.`client_user_id`
  OR NEW.`title`<>OLD.`title`
  OR NEW.`description`<>OLD.`description`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'lawyer document request identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_document_requests_terminal_guard`
BEFORE UPDATE ON `lawyer_document_requests`
WHEN OLD.`status` IN ('provided','cancelled')
BEGIN
  SELECT RAISE(ABORT, 'lawyer document request is terminal');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_document_requests_no_delete`
BEFORE DELETE ON `lawyer_document_requests`
BEGIN
  SELECT RAISE(ABORT, 'lawyer document requests are append-only');
END;
