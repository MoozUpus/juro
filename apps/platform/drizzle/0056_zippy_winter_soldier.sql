CREATE UNIQUE INDEX `lawyer_review_moderation_review_uidx` ON `lawyer_review_moderation` (`review_id`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_moderation_applies_terminal_status`
AFTER INSERT ON `lawyer_review_moderation`
BEGIN
  UPDATE `lawyer_reviews`
  SET `status`=NEW.`decision`, `updated_at`=NEW.`created_at`
  WHERE `id`=NEW.`review_id` AND `status`='pending';
END;