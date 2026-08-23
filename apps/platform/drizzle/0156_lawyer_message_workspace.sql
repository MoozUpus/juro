-- Migration 0156: complete the professional request-chat contract with
-- request-scoped replies, one persisted pin and bounded ephemeral typing state.
ALTER TABLE `lawyer_request_messages`
  ADD COLUMN `reply_to_message_id` text;
--> statement-breakpoint
ALTER TABLE `lawyer_request_messages`
  ADD COLUMN `pinned_at` text;
--> statement-breakpoint
ALTER TABLE `lawyer_request_messages`
  ADD COLUMN `pinned_by_user_id` text;
--> statement-breakpoint
DROP TRIGGER `lawyer_request_messages_content_immutable`;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_messages_content_immutable`
BEFORE UPDATE ON `lawyer_request_messages`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`author_user_id`<>OLD.`author_user_id`
  OR NEW.`author_role`<>OLD.`author_role`
  OR NEW.`body`<>OLD.`body`
  OR NEW.`reply_to_message_id` IS NOT OLD.`reply_to_message_id`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message content is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_messages_reply_scope_guard`
BEFORE INSERT ON `lawyer_request_messages`
WHEN NEW.`reply_to_message_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `lawyer_request_messages` parent
  WHERE parent.`id`=NEW.`reply_to_message_id`
    AND parent.`lawyer_request_id`=NEW.`lawyer_request_id`
)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message reply scope is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_messages_pin_shape_guard_insert`
BEFORE INSERT ON `lawyer_request_messages`
WHEN (NEW.`pinned_at` IS NULL)<>(NEW.`pinned_by_user_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message pin state is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_messages_pin_shape_guard_update`
BEFORE UPDATE OF `pinned_at`,`pinned_by_user_id` ON `lawyer_request_messages`
WHEN (NEW.`pinned_at` IS NULL)<>(NEW.`pinned_by_user_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message pin state is invalid');
END;
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_request_messages_one_pin_uidx`
  ON `lawyer_request_messages` (`lawyer_request_id`)
  WHERE `pinned_at` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `lawyer_request_messages_reply_idx`
  ON `lawyer_request_messages` (`reply_to_message_id`);
--> statement-breakpoint
CREATE TABLE `lawyer_request_message_typing` (
  `lawyer_request_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `expires_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`lawyer_request_id`,`user_id`),
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`role` IN ('client','lawyer')),
  CHECK (`expires_at`>`updated_at`)
);
--> statement-breakpoint
CREATE INDEX `lawyer_request_message_typing_expiry_idx`
  ON `lawyer_request_message_typing` (`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_message_typing_identity_immutable`
BEFORE UPDATE ON `lawyer_request_message_typing`
WHEN NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`user_id`<>OLD.`user_id`
  OR NEW.`role`<>OLD.`role`
BEGIN
  SELECT RAISE(ABORT, 'lawyer request typing identity is immutable');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_request_internal_notes` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_request_id` text NOT NULL,
  `case_id` text NOT NULL,
  `author_user_id` text NOT NULL,
  `body` text NOT NULL,
  `document_id` text,
  `converted_task_id` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`converted_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (length(trim(`body`)) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX `lawyer_request_internal_notes_request_idx`
  ON `lawyer_request_internal_notes` (`lawyer_request_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_internal_notes_scope_guard`
BEFORE INSERT ON `lawyer_request_internal_notes`
WHEN NOT EXISTS (
  SELECT 1 FROM `lawyer_requests` request
  WHERE request.`id`=NEW.`lawyer_request_id`
    AND request.`case_id`=NEW.`case_id`
)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request internal note scope is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_internal_notes_task_scope_guard`
BEFORE UPDATE OF `converted_task_id` ON `lawyer_request_internal_notes`
WHEN NEW.`converted_task_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `tasks` task
  WHERE task.`id`=NEW.`converted_task_id`
    AND task.`case_id`=NEW.`case_id`
    AND task.`owner_user_id`=NEW.`author_user_id`
)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request internal note task scope is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_internal_notes_identity_immutable`
BEFORE UPDATE ON `lawyer_request_internal_notes`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`case_id`<>OLD.`case_id`
  OR NEW.`author_user_id`<>OLD.`author_user_id`
  OR NEW.`body`<>OLD.`body`
  OR NEW.`document_id` IS NOT OLD.`document_id`
  OR NEW.`created_at`<>OLD.`created_at`
  OR OLD.`converted_task_id` IS NOT NULL
  OR NEW.`converted_task_id` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'lawyer request internal note is immutable');
END;
