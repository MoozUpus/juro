-- Migration 0149: short-lived, retry-safe encrypted handoff for legal questions
-- entered on the dashboard. Raw handles and plaintext questions are never
-- persisted; successful AI submission finalizes and clears the payload.
CREATE TABLE `ai_question_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`question_ciphertext` text,
	`question_iv` text,
	`question_key_version` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ai_question_intakes_hash_check` CHECK (
		`token_hash` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	),
	CONSTRAINT `ai_question_intakes_expiry_check` CHECK (`expires_at` > `created_at`),
	CONSTRAINT `ai_question_intakes_payload_check` CHECK (
		(
			`consumed_at` IS NULL
			AND `question_ciphertext` IS NOT NULL
			AND length(`question_ciphertext`) BETWEEN 20 AND 25000
			AND `question_iv` IS NOT NULL
			AND length(`question_iv`) = 16
			AND `question_key_version` IS NOT NULL
			AND length(`question_key_version`) BETWEEN 1 AND 32
		)
		OR (
			`consumed_at` IS NOT NULL
			AND `question_ciphertext` IS NULL
			AND `question_iv` IS NULL
			AND `question_key_version` IS NULL
		)
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_question_intakes_token_uidx` ON `ai_question_intakes` (`token_hash`);--> statement-breakpoint
CREATE INDEX `ai_question_intakes_expiry_idx` ON `ai_question_intakes` (`expires_at`,`consumed_at`);--> statement-breakpoint
CREATE INDEX `ai_question_intakes_owner_idx` ON `ai_question_intakes` (`workspace_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `ai_question_intakes_membership_guard`
BEFORE INSERT ON `ai_question_intakes`
WHEN NOT EXISTS (
	SELECT 1 FROM `workspace_members` AS member
	WHERE member.`workspace_id`=NEW.`workspace_id`
		AND member.`user_id`=NEW.`user_id`
		AND member.`status`='active'
)
BEGIN
	SELECT RAISE(ABORT,'AI_QUESTION_INTAKE_ACCESS_DENIED');
END;--> statement-breakpoint
CREATE TRIGGER `ai_question_intakes_capacity_guard`
BEFORE INSERT ON `ai_question_intakes`
WHEN (
	SELECT count(*) FROM `ai_question_intakes` AS intake
	WHERE intake.`workspace_id`=NEW.`workspace_id`
		AND intake.`user_id`=NEW.`user_id`
		AND intake.`expires_at`>NEW.`created_at`
) >= 5
BEGIN
	SELECT RAISE(ABORT,'AI_QUESTION_INTAKE_CAPACITY_EXCEEDED');
END;
