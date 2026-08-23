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
