CREATE TABLE `message_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_branch_id` text,
	`forked_from_message_id` text,
	`request_message_id` text NOT NULL,
	`response_message_id` text NOT NULL,
	`operation` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`forked_from_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`request_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`response_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_branches_operation_check" CHECK("message_branches"."operation" IN ('new','follow_up','edit','regenerate'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_branches_request_uidx` ON `message_branches` (`request_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_branches_response_uidx` ON `message_branches` (`response_message_id`);--> statement-breakpoint
CREATE INDEX `message_branches_conversation_idx` ON `message_branches` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_branches_parent_idx` ON `message_branches` (`parent_branch_id`);--> statement-breakpoint
CREATE TABLE `message_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`message_id` text NOT NULL,
	`source_message_id` text,
	`created_by_user_id` text NOT NULL,
	`operation` text NOT NULL,
	`version_number` integer DEFAULT 1 NOT NULL,
	`content_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `message_branches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_versions_operation_check" CHECK("message_versions"."operation" IN ('new','follow_up','edit','regenerate')),
	CONSTRAINT "message_versions_number_check" CHECK("message_versions"."version_number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_versions_message_uidx` ON `message_versions` (`message_id`);--> statement-breakpoint
CREATE INDEX `message_versions_conversation_idx` ON `message_versions` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_versions_source_idx` ON `message_versions` (`source_message_id`,`version_number`);--> statement-breakpoint
CREATE TRIGGER `message_branches_insert_guard`
BEFORE INSERT ON `message_branches`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'MESSAGE_BRANCH_TENANT_MISMATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM `conversations` c
    WHERE c.`id` = NEW.`conversation_id`
      AND c.`workspace_id` = NEW.`workspace_id`
      AND c.`owner_user_id` = NEW.`owner_user_id`
  );
  SELECT RAISE(ABORT, 'MESSAGE_BRANCH_REQUEST_MISMATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM `conversation_messages` m
    WHERE m.`id` = NEW.`request_message_id` AND m.`conversation_id` = NEW.`conversation_id` AND m.`author_type` = 'user'
  );
  SELECT RAISE(ABORT, 'MESSAGE_BRANCH_RESPONSE_MISMATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM `conversation_messages` m
    WHERE m.`id` = NEW.`response_message_id` AND m.`conversation_id` = NEW.`conversation_id` AND m.`author_type` = 'assistant'
  );
  SELECT RAISE(ABORT, 'MESSAGE_BRANCH_PARENT_MISMATCH')
  WHERE NEW.`parent_branch_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `message_branches` b WHERE b.`id` = NEW.`parent_branch_id` AND b.`conversation_id` = NEW.`conversation_id`
  );
  SELECT RAISE(ABORT, 'MESSAGE_BRANCH_FORK_MISMATCH')
  WHERE NEW.`forked_from_message_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `conversation_messages` m WHERE m.`id` = NEW.`forked_from_message_id` AND m.`conversation_id` = NEW.`conversation_id`
  );
END;
--> statement-breakpoint
CREATE TRIGGER `message_versions_insert_guard`
BEFORE INSERT ON `message_versions`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'MESSAGE_VERSION_BRANCH_MISMATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM `message_branches` b
    WHERE b.`id` = NEW.`branch_id` AND b.`conversation_id` = NEW.`conversation_id`
      AND b.`owner_user_id` = NEW.`created_by_user_id` AND b.`request_message_id` = NEW.`message_id`
      AND b.`operation` = NEW.`operation`
  );
  SELECT RAISE(ABORT, 'MESSAGE_VERSION_SOURCE_MISMATCH')
  WHERE NEW.`source_message_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `conversation_messages` m WHERE m.`id` = NEW.`source_message_id` AND m.`conversation_id` = NEW.`conversation_id`
  );
  SELECT RAISE(ABORT, 'MESSAGE_VERSION_NUMBER_INVALID')
  WHERE (NEW.`source_message_id` IS NULL AND NEW.`version_number` <> 1)
     OR (NEW.`source_message_id` IS NOT NULL AND NEW.`version_number` < 2);
  SELECT RAISE(ABORT, 'MESSAGE_VERSION_HASH_INVALID')
  WHERE length(NEW.`content_sha256`) <> 64 OR NEW.`content_sha256` GLOB '*[^0-9a-f]*';
END;
--> statement-breakpoint
CREATE TRIGGER `message_branches_update_block` BEFORE UPDATE ON `message_branches` BEGIN SELECT RAISE(ABORT, 'MESSAGE_BRANCH_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `message_versions_update_block` BEFORE UPDATE ON `message_versions` BEGIN SELECT RAISE(ABORT, 'MESSAGE_VERSION_IMMUTABLE'); END;
