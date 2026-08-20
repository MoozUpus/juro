ALTER TABLE `lawyer_request_messages`
  ADD COLUMN `read_at` text;
--> statement-breakpoint
CREATE INDEX `lawyer_request_messages_unread_idx`
  ON `lawyer_request_messages` (`lawyer_request_id`,`read_at`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_messages_content_immutable`
BEFORE UPDATE ON `lawyer_request_messages`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`author_user_id`<>OLD.`author_user_id`
  OR NEW.`author_role`<>OLD.`author_role`
  OR NEW.`body`<>OLD.`body`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message content is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_messages_read_terminal`
BEFORE UPDATE ON `lawyer_request_messages`
WHEN OLD.`read_at` IS NOT NULL AND NEW.`read_at` IS NOT OLD.`read_at`
BEGIN
  SELECT RAISE(ABORT, 'read lawyer request message is terminal');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_request_message_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL,
  `lawyer_request_id` text NOT NULL,
  `document_id` text NOT NULL,
  `shared_by_user_id` text NOT NULL,
  `recipient_user_id` text NOT NULL,
  `status` text DEFAULT 'sent' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `lawyer_request_messages`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`shared_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recipient_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`status` IN ('sent','viewed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_request_message_attachments_message_uidx`
  ON `lawyer_request_message_attachments` (`message_id`);
--> statement-breakpoint
CREATE INDEX `lawyer_request_message_attachments_document_idx`
  ON `lawyer_request_message_attachments` (`document_id`,`recipient_user_id`);
--> statement-breakpoint
CREATE INDEX `lawyer_request_message_attachments_recipient_idx`
  ON `lawyer_request_message_attachments` (`lawyer_request_id`,`recipient_user_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_message_attachments_scope_guard`
BEFORE INSERT ON `lawyer_request_message_attachments`
WHEN NOT EXISTS (
  SELECT 1
  FROM `lawyer_request_messages` m
  JOIN `lawyer_requests` r ON r.`id`=m.`lawyer_request_id`
  JOIN `lawyer_profiles` p ON p.`id`=r.`lawyer_profile_id`
  JOIN `documents` d ON d.`id`=NEW.`document_id`
  LEFT JOIN `user_profiles` lawyer_user ON lawyer_user.`id`=p.`user_id`
  WHERE m.`id`=NEW.`message_id`
    AND m.`lawyer_request_id`=NEW.`lawyer_request_id`
    AND m.`author_user_id`=NEW.`shared_by_user_id`
    AND (
      (
        NEW.`shared_by_user_id`=r.`requester_user_id`
        AND NEW.`recipient_user_id`=p.`user_id`
        AND d.`owner_user_id`=r.`requester_user_id`
        AND d.`workspace_id`=r.`workspace_id`
        AND d.`case_id`=r.`case_id`
      )
      OR
      (
        NEW.`shared_by_user_id`=p.`user_id`
        AND NEW.`recipient_user_id`=r.`requester_user_id`
        AND d.`owner_user_id`=p.`user_id`
        AND d.`workspace_id`=lawyer_user.`default_workspace_id`
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message attachment scope is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_message_attachments_identity_immutable`
BEFORE UPDATE ON `lawyer_request_message_attachments`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`message_id`<>OLD.`message_id`
  OR NEW.`lawyer_request_id`<>OLD.`lawyer_request_id`
  OR NEW.`document_id`<>OLD.`document_id`
  OR NEW.`shared_by_user_id`<>OLD.`shared_by_user_id`
  OR NEW.`recipient_user_id`<>OLD.`recipient_user_id`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message attachment identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_message_attachments_viewed_terminal`
BEFORE UPDATE ON `lawyer_request_message_attachments`
WHEN OLD.`status`='viewed' AND NEW.`status`<>'viewed'
BEGIN
  SELECT RAISE(ABORT, 'viewed lawyer request message attachment is terminal');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_request_message_attachments_no_direct_delete`
BEFORE DELETE ON `lawyer_request_message_attachments`
WHEN EXISTS (SELECT 1 FROM `lawyer_request_messages` WHERE `id`=OLD.`message_id`)
  AND EXISTS (SELECT 1 FROM `lawyer_requests` WHERE `id`=OLD.`lawyer_request_id`)
  AND EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=OLD.`shared_by_user_id`)
  AND EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=OLD.`recipient_user_id`)
BEGIN
  SELECT RAISE(ABORT, 'lawyer request message attachments are append-only');
END;
