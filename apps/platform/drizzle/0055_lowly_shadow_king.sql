CREATE TABLE `lawyer_review_moderation` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`moderator_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`moderated_body` text,
	`reason` text NOT NULL,
	`original_body_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `lawyer_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moderator_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "lawyer_review_moderation_decision_check" CHECK("lawyer_review_moderation"."decision" IN ('approved','rejected')),
	CONSTRAINT "lawyer_review_moderation_sha_check" CHECK(length("lawyer_review_moderation"."original_body_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX `lawyer_review_moderation_review_idx` ON `lawyer_review_moderation` (`review_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `lawyer_review_moderation_moderator_idx` ON `lawyer_review_moderation` (`moderator_user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_moderation_immutable_update`
BEFORE UPDATE ON `lawyer_review_moderation`
BEGIN
  SELECT RAISE(ABORT, 'lawyer review moderation is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_moderation_immutable_delete`
BEFORE DELETE ON `lawyer_review_moderation`
BEGIN
  SELECT RAISE(ABORT, 'lawyer review moderation cannot be deleted');
END;