CREATE TABLE `account_deletion_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`email_hash` text NOT NULL,
	`locale` text NOT NULL,
	`code_salt` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumed_by_operation_id` text,
	`invalidated_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "account_deletion_challenges_locale_check" CHECK("account_deletion_challenges"."locale" IN ('ru','uz')),
	CONSTRAINT "account_deletion_challenges_attempts_check" CHECK("account_deletion_challenges"."attempt_count" >= 0 AND "account_deletion_challenges"."max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_challenges_operation_uidx` ON `account_deletion_challenges` (`consumed_by_operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_challenges_active_user_uidx` ON `account_deletion_challenges` (`user_id`) WHERE "account_deletion_challenges"."consumed_at" IS NULL AND "account_deletion_challenges"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX `account_deletion_challenges_user_created_idx` ON `account_deletion_challenges` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_deletion_challenges_expiry_idx` ON `account_deletion_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `policy_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`document_key` text NOT NULL,
	`document_version` text NOT NULL,
	`locale` text NOT NULL,
	`content_sha256` text NOT NULL,
	`status` text NOT NULL,
	`effective_at` text,
	`published_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT "policy_documents_locale_check" CHECK("policy_documents"."locale" IN ('ru','uz')),
	CONSTRAINT "policy_documents_status_check" CHECK("policy_documents"."status" IN ('draft','approved','superseded')),
	CONSTRAINT "policy_documents_sha256_check" CHECK(length("policy_documents"."content_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_documents_version_uidx` ON `policy_documents` (`document_key`,`document_version`,`locale`);--> statement-breakpoint
CREATE INDEX `policy_documents_status_idx` ON `policy_documents` (`status`,`document_key`);--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `verification_challenge_id` text REFERENCES account_deletion_challenges(id);--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `requested_session_id` text REFERENCES auth_sessions(id);--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `verification_method` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `verified_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_requests_challenge_uidx` ON `account_deletion_requests` (`verification_challenge_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_requests_active_user_uidx` ON `account_deletion_requests` (`user_id`) WHERE "account_deletion_requests"."status" IN ('requested','reviewing');--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `policy_document_id` text REFERENCES policy_documents(id);--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `content_sha256` text;--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `acceptance_method` text;--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `auth_source` text;--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `session_id` text REFERENCES auth_sessions(id);--> statement-breakpoint
ALTER TABLE `user_acceptances` ADD `evidence_json` text;--> statement-breakpoint
CREATE INDEX `user_acceptances_policy_idx` ON `user_acceptances` (`policy_document_id`,`accepted_at`);--> statement-breakpoint
UPDATE `user_acceptances`
SET
	`locale` = coalesce(
		(SELECT `locale` FROM `user_profiles`
		 WHERE `user_profiles`.`id` = `user_acceptances`.`user_id`),
		'ru'
	),
	`acceptance_method` = 'legacy_unverified',
	`auth_source` = 'legacy',
	`evidence_json` = '{"migration":"0015","evidence":"legacy_version_only"}'
WHERE `policy_document_id` IS NULL;--> statement-breakpoint
CREATE TRIGGER `policy_documents_no_update`
BEFORE UPDATE ON `policy_documents`
BEGIN
	SELECT RAISE(ABORT, 'policy_documents append-only');
END;--> statement-breakpoint
CREATE TRIGGER `policy_documents_no_delete`
BEFORE DELETE ON `policy_documents`
BEGIN
	SELECT RAISE(ABORT, 'policy_documents append-only');
END;--> statement-breakpoint
CREATE TRIGGER `user_acceptances_policy_guard`
BEFORE INSERT ON `user_acceptances`
WHEN NEW.`policy_document_id` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `policy_documents`
		WHERE `id` = NEW.`policy_document_id`
			AND `document_key` = NEW.`document_key`
			AND `document_version` = NEW.`document_version`
			AND `locale` = NEW.`locale`
			AND `content_sha256` = NEW.`content_sha256`
	)
BEGIN
	SELECT RAISE(ABORT, 'user_acceptances policy evidence mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `user_acceptances_no_update`
BEFORE UPDATE ON `user_acceptances`
BEGIN
	SELECT RAISE(ABORT, 'user_acceptances append-only');
END;--> statement-breakpoint
CREATE TRIGGER `user_acceptances_no_delete`
BEFORE DELETE ON `user_acceptances`
BEGIN
	SELECT RAISE(ABORT, 'user_acceptances append-only');
END;--> statement-breakpoint
CREATE TRIGGER `account_deletion_requests_verification_guard`
BEFORE INSERT ON `account_deletion_requests`
WHEN NEW.`verification_challenge_id` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `account_deletion_challenges`
		WHERE `id` = NEW.`verification_challenge_id`
			AND `user_id` = NEW.`user_id`
			AND `session_id` = NEW.`requested_session_id`
			AND `consumed_at` = NEW.`verified_at`
			AND `consumed_by_operation_id` IS NOT NULL
			AND NEW.`verification_method` = 'email_otp'
	)
BEGIN
	SELECT RAISE(ABORT, 'account_deletion_requests verification mismatch');
END;
