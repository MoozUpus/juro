-- Migration 0165: privacy-minimal evidence that an authorized user opened a
-- citation attached to an AI answer. The row stores no query, answer, source
-- URL, profile, workspace, case, contact, or document content.
CREATE TABLE `ai_answer_source_opens` (
  `user_id` text NOT NULL,
  `response_message_id` text NOT NULL,
  `first_opened_at` text NOT NULL,
  `last_opened_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`response_message_id`),
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`response_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`first_opened_at` <= `last_opened_at`)
);
--> statement-breakpoint
CREATE INDEX `ai_answer_source_opens_first_opened_idx`
ON `ai_answer_source_opens` (`first_opened_at`,`user_id`);
--> statement-breakpoint
CREATE TRIGGER `ai_answer_source_opens_owner_insert`
BEFORE INSERT ON `ai_answer_source_opens`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `conversation_messages` AS `message`
  INNER JOIN `conversations` AS `conversation`
    ON `conversation`.`id`=`message`.`conversation_id`
  WHERE `message`.`id`=NEW.`response_message_id`
    AND `message`.`author_type`='assistant'
    AND `conversation`.`owner_user_id`=NEW.`user_id`
)
BEGIN
  SELECT RAISE(ABORT,'AI_ANSWER_SOURCE_OPEN_OWNER_MISMATCH');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_answer_source_opens_owner_update`
BEFORE UPDATE OF `user_id`,`response_message_id` ON `ai_answer_source_opens`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `conversation_messages` AS `message`
  INNER JOIN `conversations` AS `conversation`
    ON `conversation`.`id`=`message`.`conversation_id`
  WHERE `message`.`id`=NEW.`response_message_id`
    AND `message`.`author_type`='assistant'
    AND `conversation`.`owner_user_id`=NEW.`user_id`
)
BEGIN
  SELECT RAISE(ABORT,'AI_ANSWER_SOURCE_OPEN_OWNER_MISMATCH');
END;
