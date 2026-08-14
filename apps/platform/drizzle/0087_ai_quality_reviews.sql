-- Migration 0087: immutable legal-team review decisions for user-reported AI answers.
CREATE TABLE `ai_quality_review_contents` (
	`event_id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`captured_feedback_updated_at` text NOT NULL,
	`reviewer_notes` text NOT NULL,
	`corrected_answer` text,
	`golden_answer` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `ai_feedback`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_quality_review_contents_feedback_idx`
ON `ai_quality_review_contents` (`feedback_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_contents_no_update`
BEFORE UPDATE ON `ai_quality_review_contents`
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_CONTENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `ai_quality_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`actor_assignment_id` text NOT NULL,
	`capability` text NOT NULL,
	`request_action` text NOT NULL,
	`feedback_id` text,
	`review_version` integer DEFAULT 0 NOT NULL,
	`classification` text,
	`filters_hash` text NOT NULL,
	`result_count` integer NOT NULL,
	`result_digest` text NOT NULL,
	`feedback_updated_at` text,
	`question_hash` text NOT NULL,
	`answer_hash` text NOT NULL,
	`comment_hash` text NOT NULL,
	`notes_hash` text NOT NULL,
	`corrected_answer_hash` text NOT NULL,
	`golden_answer_hash` text NOT NULL,
	`actor_mfa_verified_at` text NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `ai_quality_review_capability_check` CHECK (`capability`='ai.quality.review'),
	CONSTRAINT `ai_quality_review_action_check` CHECK (`request_action` IN ('query','view','resolve')),
	CONSTRAINT `ai_quality_review_classification_check` CHECK (`classification` IS NULL OR `classification` IN ('correct','partially_incorrect','incorrect','unsafe','outdated_source','broken_citation','insufficient_context','language_issue')),
	CONSTRAINT `ai_quality_review_shape_check` CHECK (
		(`request_action`='query' AND `feedback_id` IS NULL AND `review_version`=0 AND `classification` IS NULL AND `feedback_updated_at` IS NULL)
		OR (`request_action`='view' AND `feedback_id` IS NOT NULL AND `review_version`=0 AND `classification` IS NULL AND `feedback_updated_at` IS NOT NULL AND `result_count`=1)
		OR (`request_action`='resolve' AND `feedback_id` IS NOT NULL AND `review_version`>0 AND `classification` IS NOT NULL AND `feedback_updated_at` IS NOT NULL AND `result_count`=1)
	),
	CONSTRAINT `ai_quality_review_count_check` CHECK (`result_count` BETWEEN 0 AND 200),
	CONSTRAINT `ai_quality_review_filters_hash_check` CHECK (length(`filters_hash`)=64 AND `filters_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_result_digest_check` CHECK (length(`result_digest`)=64 AND `result_digest` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_question_hash_check` CHECK (length(`question_hash`)=64 AND `question_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_answer_hash_check` CHECK (length(`answer_hash`)=64 AND `answer_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_comment_hash_check` CHECK (length(`comment_hash`)=64 AND `comment_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_notes_hash_check` CHECK (length(`notes_hash`)=64 AND `notes_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_corrected_hash_check` CHECK (length(`corrected_answer_hash`)=64 AND `corrected_answer_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_golden_hash_check` CHECK (length(`golden_answer_hash`)=64 AND `golden_answer_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_previous_hash_check` CHECK (length(`previous_hash`)=64 AND `previous_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_event_hash_check` CHECK (length(`event_hash`)=64 AND `event_hash` NOT GLOB '*[^A-F0-9]*'),
	CONSTRAINT `ai_quality_review_mfa_time_check` CHECK (`actor_mfa_verified_at`<=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_quality_review_event_hash_uidx`
ON `ai_quality_review_events` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_quality_review_chain_uidx`
ON `ai_quality_review_events` (`actor_user_id`,`previous_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_quality_review_version_uidx`
ON `ai_quality_review_events` (`feedback_id`,`review_version`) WHERE `request_action`='resolve';
--> statement-breakpoint
CREATE INDEX `ai_quality_review_feedback_created_idx`
ON `ai_quality_review_events` (`feedback_id`,`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `ai_quality_review_actor_created_idx`
ON `ai_quality_review_events` (`actor_user_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_chain_guard`
BEFORE INSERT ON `ai_quality_review_events`
WHEN (
	NOT EXISTS (SELECT 1 FROM `ai_quality_review_events` WHERE `actor_user_id`=NEW.`actor_user_id`)
	AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000'
)
OR (
	EXISTS (SELECT 1 FROM `ai_quality_review_events` WHERE `actor_user_id`=NEW.`actor_user_id`)
	AND NOT EXISTS (
		SELECT 1 FROM `ai_quality_review_events` AS parent
		WHERE parent.`actor_user_id`=NEW.`actor_user_id`
		  AND parent.`event_hash`=NEW.`previous_hash`
		  AND NOT EXISTS (
			SELECT 1 FROM `ai_quality_review_events` AS child
			WHERE child.`actor_user_id`=parent.`actor_user_id`
			  AND child.`previous_hash`=parent.`event_hash`
		  )
	)
)
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_CHAIN_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_actor_guard`
BEFORE INSERT ON `ai_quality_review_events`
WHEN NOT EXISTS (
	SELECT 1
	FROM `auth_sessions` AS session
	JOIN `platform_staff_assignments` AS assignment
	  ON assignment.`id`=NEW.`actor_assignment_id`
	 AND assignment.`user_id`=NEW.`actor_user_id`
	LEFT JOIN `auth_devices` AS device ON device.`id`=session.`device_id`
	WHERE session.`id`=NEW.`actor_session_id`
	  AND session.`user_id`=NEW.`actor_user_id`
	  AND session.`revoked_at` IS NULL
	  AND session.`assurance_level`='mfa'
	  AND session.`mfa_verified_at`=NEW.`actor_mfa_verified_at`
	  AND unixepoch(NEW.`created_at`)-unixepoch(session.`mfa_verified_at`) BETWEEN 0 AND 900
	  AND session.`expires_at`>NEW.`created_at`
	  AND coalesce(session.`idle_expires_at`,session.`expires_at`)>NEW.`created_at`
	  AND (session.`device_id` IS NULL OR (device.`id` IS NOT NULL AND device.`revoked_at` IS NULL))
	  AND assignment.`role`='legal_reviewer'
	  AND assignment.`granted_at`<=NEW.`created_at`
	  AND assignment.`expires_at`>NEW.`created_at`
	  AND assignment.`revoked_at` IS NULL
	  AND EXISTS (
		SELECT 1 FROM `auth_totp_credentials` AS totp
		WHERE totp.`user_id`=NEW.`actor_user_id`
		  AND totp.`status`='active'
		  AND totp.`verified_at` IS NOT NULL
		  AND totp.`verified_at`<=NEW.`actor_mfa_verified_at`
		  AND totp.`disabled_at` IS NULL
	  )
)
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_ACCESS_DENIED');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_view_guard`
BEFORE INSERT ON `ai_quality_review_events`
WHEN NEW.`request_action`='view' AND NOT EXISTS (
	SELECT 1 FROM `ai_feedback`
	WHERE `id`=NEW.`feedback_id` AND `updated_at`=NEW.`feedback_updated_at`
)
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_STALE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_resolve_guard`
BEFORE INSERT ON `ai_quality_review_events`
WHEN NEW.`request_action`='resolve' AND (
	NOT EXISTS (
		SELECT 1 FROM `ai_feedback`
		WHERE `id`=NEW.`feedback_id` AND `updated_at`=NEW.`feedback_updated_at`
	)
	OR NEW.`review_version`<>(
		SELECT coalesce(max(`review_version`),0)+1
		FROM `ai_quality_review_events`
		WHERE `feedback_id`=NEW.`feedback_id` AND `request_action`='resolve'
	)
	OR NOT EXISTS (
		SELECT 1 FROM `ai_quality_review_contents`
		WHERE `event_id`=NEW.`id`
		  AND `feedback_id`=NEW.`feedback_id`
		  AND `reviewer_user_id`=NEW.`actor_user_id`
		  AND `captured_feedback_updated_at`=NEW.`feedback_updated_at`
	)
)
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_STALE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_events_no_update`
BEFORE UPDATE ON `ai_quality_review_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_quality_review_events_no_delete`
BEFORE DELETE ON `ai_quality_review_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_QUALITY_REVIEW_EVENT_IMMUTABLE');
END;
