DROP TRIGGER `user_acceptances_policy_guard`;
--> statement-breakpoint
DROP TRIGGER `user_acceptances_no_update`;
--> statement-breakpoint
DROP TRIGGER `user_acceptances_no_delete`;
--> statement-breakpoint
DROP TRIGGER `policy_documents_no_update`;
--> statement-breakpoint
DROP TRIGGER `policy_documents_no_delete`;
--> statement-breakpoint
CREATE TABLE `policy_documents_v0151` (
	`id` text PRIMARY KEY NOT NULL,
	`document_key` text NOT NULL,
	`document_version` text NOT NULL,
	`locale` text NOT NULL,
	`content_sha256` text NOT NULL,
	`status` text NOT NULL,
	`effective_at` text,
	`published_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `policy_documents_locale_check` CHECK(`locale` IN ('ru','uz','en')),
	CONSTRAINT `policy_documents_status_check` CHECK(`status` IN ('draft','approved','superseded')),
	CONSTRAINT `policy_documents_sha256_check` CHECK(length(`content_sha256`) = 64)
);
--> statement-breakpoint
INSERT INTO `policy_documents_v0151` (
	`id`,`document_key`,`document_version`,`locale`,`content_sha256`,`status`,
	`effective_at`,`published_at`,`created_at`
)
SELECT
	`id`,`document_key`,`document_version`,`locale`,`content_sha256`,`status`,
	`effective_at`,`published_at`,`created_at`
FROM `policy_documents`;
--> statement-breakpoint
CREATE TABLE `user_acceptances_v0151` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_key` text NOT NULL,
	`document_version` text NOT NULL,
	`accepted_at` text NOT NULL,
	`policy_document_id` text REFERENCES `policy_documents_v0151`(`id`),
	`locale` text,
	`content_sha256` text,
	`acceptance_method` text,
	`auth_source` text,
	`session_id` text REFERENCES `auth_sessions`(`id`),
	`evidence_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `user_acceptances_v0151` (
	`id`,`user_id`,`document_key`,`document_version`,`accepted_at`,
	`policy_document_id`,`locale`,`content_sha256`,`acceptance_method`,
	`auth_source`,`session_id`,`evidence_json`
)
SELECT
	`id`,`user_id`,`document_key`,`document_version`,`accepted_at`,
	`policy_document_id`,`locale`,`content_sha256`,`acceptance_method`,
	`auth_source`,`session_id`,`evidence_json`
FROM `user_acceptances`;
--> statement-breakpoint
DROP TABLE `user_acceptances`;
--> statement-breakpoint
DROP TABLE `policy_documents`;
--> statement-breakpoint
ALTER TABLE `policy_documents_v0151` RENAME TO `policy_documents`;
--> statement-breakpoint
ALTER TABLE `user_acceptances_v0151` RENAME TO `user_acceptances`;
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_documents_version_uidx` ON `policy_documents` (`document_key`,`document_version`,`locale`);
--> statement-breakpoint
CREATE INDEX `policy_documents_status_idx` ON `policy_documents` (`status`,`document_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_acceptances_uidx` ON `user_acceptances` (`user_id`,`document_key`,`document_version`);
--> statement-breakpoint
CREATE INDEX `user_acceptances_policy_idx` ON `user_acceptances` (`policy_document_id`,`accepted_at`);
--> statement-breakpoint
CREATE TRIGGER `policy_documents_no_update`
BEFORE UPDATE ON `policy_documents`
BEGIN
	SELECT RAISE(ABORT, 'policy_documents append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `policy_documents_no_delete`
BEFORE DELETE ON `policy_documents`
BEGIN
	SELECT RAISE(ABORT, 'policy_documents append-only');
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
CREATE TRIGGER `user_acceptances_no_update`
BEFORE UPDATE ON `user_acceptances`
BEGIN
	SELECT RAISE(ABORT, 'user_acceptances append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `user_acceptances_no_delete`
BEFORE DELETE ON `user_acceptances`
BEGIN
	SELECT RAISE(ABORT, 'user_acceptances append-only');
END;
