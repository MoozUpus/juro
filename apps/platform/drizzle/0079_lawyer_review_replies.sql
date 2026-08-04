-- Migration 0079: versioned, moderated lawyer replies to approved reviews.
CREATE TABLE `lawyer_review_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`version` integer NOT NULL,
	`lawyer_profile_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `lawyer_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `lawyer_review_replies_status_check` CHECK (`status` IN ('pending','approved','rejected')),
	CONSTRAINT `lawyer_review_replies_version_check` CHECK (`version` >= 1),
	CONSTRAINT `lawyer_review_replies_body_check` CHECK (length(trim(`body`)) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_review_replies_review_version_uidx` ON `lawyer_review_replies` (`review_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_review_replies_author_request_uidx` ON `lawyer_review_replies` (`author_user_id`,`client_request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_review_replies_one_open_uidx` ON `lawyer_review_replies` (`review_id`) WHERE `status` IN ('pending','approved');
--> statement-breakpoint
CREATE INDEX `lawyer_review_replies_profile_status_idx` ON `lawyer_review_replies` (`lawyer_profile_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `lawyer_review_reply_moderation` (
	`id` text PRIMARY KEY NOT NULL,
	`reply_id` text NOT NULL,
	`moderator_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`moderated_body` text,
	`reason` text NOT NULL,
	`original_body_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reply_id`) REFERENCES `lawyer_review_replies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moderator_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `lawyer_review_reply_moderation_decision_check` CHECK (`decision` IN ('approved','rejected')),
	CONSTRAINT `lawyer_review_reply_moderation_sha_check` CHECK (length(`original_body_sha256`) = 64),
	CONSTRAINT `lawyer_review_reply_moderation_reason_check` CHECK (length(trim(`reason`)) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_review_reply_moderation_reply_uidx` ON `lawyer_review_reply_moderation` (`reply_id`);
--> statement-breakpoint
CREATE INDEX `lawyer_review_reply_moderation_moderator_idx` ON `lawyer_review_reply_moderation` (`moderator_user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_pending_insert_guard`
BEFORE INSERT ON `lawyer_review_replies`
WHEN NEW.`status` <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'lawyer review reply must start pending');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_author_insert_guard`
BEFORE INSERT ON `lawyer_review_replies`
WHEN NOT EXISTS (
		SELECT 1 FROM `lawyer_reviews` r
		JOIN `lawyer_review_moderation` m ON m.`review_id`=r.`id` AND m.`decision`='approved'
		JOIN `lawyer_profiles` p ON p.`id`=r.`lawyer_profile_id`
		WHERE r.`id`=NEW.`review_id` AND r.`status`='approved'
			AND p.`id`=NEW.`lawyer_profile_id` AND p.`user_id`=NEW.`author_user_id`
			AND p.`status`='public_approved'
	)
BEGIN
  SELECT RAISE(ABORT, 'lawyer review reply author unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_version_insert_guard`
BEFORE INSERT ON `lawyer_review_replies`
WHEN NEW.`version` <> COALESCE((
		SELECT MAX(existing.`version`) + 1 FROM `lawyer_review_replies` existing
		WHERE existing.`review_id`=NEW.`review_id`
	), 1)
BEGIN
  SELECT RAISE(ABORT, 'lawyer review reply version conflict');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_content_immutable`
BEFORE UPDATE ON `lawyer_review_replies`
WHEN NEW.`review_id` <> OLD.`review_id`
	OR NEW.`version` <> OLD.`version`
	OR NEW.`lawyer_profile_id` <> OLD.`lawyer_profile_id`
	OR NEW.`author_user_id` <> OLD.`author_user_id`
	OR NEW.`client_request_id` <> OLD.`client_request_id`
	OR NEW.`body` <> OLD.`body`
	OR NEW.`created_at` <> OLD.`created_at`
	OR OLD.`status` <> 'pending'
	OR NEW.`status` NOT IN ('approved','rejected')
	OR NEW.`updated_at` <= OLD.`updated_at`
BEGIN
	SELECT RAISE(ABORT, 'lawyer review reply content is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_moderation_pending_guard`
BEFORE INSERT ON `lawyer_review_reply_moderation`
WHEN NOT EXISTS (
	SELECT 1 FROM `lawyer_review_replies` reply
	WHERE reply.`id`=NEW.`reply_id` AND reply.`status`='pending'
)
BEGIN
	SELECT RAISE(ABORT, 'lawyer review reply is not pending');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_moderation_apply_status`
AFTER INSERT ON `lawyer_review_reply_moderation`
BEGIN
	UPDATE `lawyer_review_replies`
	SET `status`=NEW.`decision`, `updated_at`=NEW.`created_at`
	WHERE `id`=NEW.`reply_id` AND `status`='pending';
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_moderation_immutable_update`
BEFORE UPDATE ON `lawyer_review_reply_moderation`
BEGIN
	SELECT RAISE(ABORT, 'lawyer review reply moderation is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_review_reply_moderation_immutable_delete`
BEFORE DELETE ON `lawyer_review_reply_moderation`
BEGIN
	SELECT RAISE(ABORT, 'lawyer review reply moderation cannot be deleted');
END;
