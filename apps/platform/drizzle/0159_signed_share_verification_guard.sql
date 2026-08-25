ALTER TABLE `standalone_signed_pdf_shares` ADD COLUMN `public_token_ciphertext` text;
--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD COLUMN `public_token_iv` text;
--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD COLUMN `public_token_key_version` text;
--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD COLUMN `access_code_ciphertext` text;
--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD COLUMN `access_code_iv` text;
--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD COLUMN `access_code_key_version` text;
--> statement-breakpoint
CREATE TABLE `signed_share_verification_guards` (
	`share_id` text PRIMARY KEY NOT NULL,
	`failed_attempt_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `standalone_signed_pdf_shares`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `signed_share_verification_failed_attempts_check` CHECK (`failed_attempt_count` >= 0 AND `failed_attempt_count` <= 5),
	CONSTRAINT `signed_share_verification_lock_check` CHECK (`locked_until` IS NULL OR `locked_until` > `window_started_at`)
);
--> statement-breakpoint
CREATE INDEX `signed_share_verification_guards_lock_idx` ON `signed_share_verification_guards` (`locked_until`);
--> statement-breakpoint
CREATE TRIGGER `standalone_signed_pdf_share_secret_insert_guard`
BEFORE INSERT ON `standalone_signed_pdf_shares`
FOR EACH ROW
WHEN
  ((NEW.`public_token_ciphertext` IS NULL) + (NEW.`public_token_iv` IS NULL) + (NEW.`public_token_key_version` IS NULL)) NOT IN (0, 3)
  OR ((NEW.`access_code_ciphertext` IS NULL) + (NEW.`access_code_iv` IS NULL) + (NEW.`access_code_key_version` IS NULL)) NOT IN (0, 3)
  OR (NEW.`public_token_ciphertext` IS NOT NULL AND (NEW.`public_token` <> '' OR NEW.`token_hash` = ''))
  OR (NEW.`access_code_ciphertext` IS NOT NULL AND (NEW.`access_code` <> '' OR NEW.`access_code_hash` = ''))
BEGIN
  SELECT RAISE(ABORT, 'invalid signed share secret state');
END;
--> statement-breakpoint
CREATE TRIGGER `standalone_signed_pdf_share_secret_update_guard`
BEFORE UPDATE OF `public_token`, `token_hash`, `public_token_ciphertext`, `public_token_iv`, `public_token_key_version`, `access_code`, `access_code_hash`, `access_code_ciphertext`, `access_code_iv`, `access_code_key_version`
ON `standalone_signed_pdf_shares`
FOR EACH ROW
WHEN
  ((NEW.`public_token_ciphertext` IS NULL) + (NEW.`public_token_iv` IS NULL) + (NEW.`public_token_key_version` IS NULL)) NOT IN (0, 3)
  OR ((NEW.`access_code_ciphertext` IS NULL) + (NEW.`access_code_iv` IS NULL) + (NEW.`access_code_key_version` IS NULL)) NOT IN (0, 3)
  OR (NEW.`public_token_ciphertext` IS NOT NULL AND (NEW.`public_token` <> '' OR NEW.`token_hash` = ''))
  OR (NEW.`access_code_ciphertext` IS NOT NULL AND (NEW.`access_code` <> '' OR NEW.`access_code_hash` = ''))
BEGIN
  SELECT RAISE(ABORT, 'invalid signed share secret state');
END;
