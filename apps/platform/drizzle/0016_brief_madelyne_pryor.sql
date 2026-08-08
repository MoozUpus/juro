ALTER TABLE `user_profiles` ADD `email_ciphertext` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `email_iv` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `email_key_version` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `email_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `email_lookup_key_version` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_ciphertext` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_iv` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_key_version` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `phone_lookup_key_version` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_email_lookup_uidx` ON `user_profiles` (`email_lookup_key_version`,`email_lookup_hash`) WHERE "user_profiles"."email_lookup_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `user_profiles_phone_lookup_idx` ON `user_profiles` (`phone_lookup_key_version`,`phone_lookup_hash`) WHERE "user_profiles"."phone_lookup_hash" IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `user_profiles_identity_insert_guard`
BEFORE INSERT ON `user_profiles`
WHEN NOT (
	(
		(
			NEW.`email_ciphertext` IS NULL
			AND NEW.`email_iv` IS NULL
			AND NEW.`email_key_version` IS NULL
			AND NEW.`email_lookup_hash` IS NULL
			AND NEW.`email_lookup_key_version` IS NULL
		)
		OR
		(
			NEW.`email_ciphertext` IS NOT NULL
			AND NEW.`email_iv` IS NOT NULL
			AND NEW.`email_key_version` IS NOT NULL
			AND NEW.`email_lookup_hash` IS NOT NULL
			AND NEW.`email_lookup_key_version` IS NOT NULL
			AND length(NEW.`email_ciphertext`) >= 22
			AND length(NEW.`email_iv`) = 16
			AND length(NEW.`email_key_version`) BETWEEN 1 AND 32
			AND length(NEW.`email_lookup_hash`) = 43
			AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
			AND NEW.`email_ciphertext` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`email_iv` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
		)
	)
	AND
	(
		(
			NEW.`phone_ciphertext` IS NULL
			AND NEW.`phone_iv` IS NULL
			AND NEW.`phone_key_version` IS NULL
			AND NEW.`phone_lookup_hash` IS NULL
			AND NEW.`phone_lookup_key_version` IS NULL
		)
		OR
		(
			NEW.`phone_ciphertext` IS NOT NULL
			AND NEW.`phone_iv` IS NOT NULL
			AND NEW.`phone_key_version` IS NOT NULL
			AND NEW.`phone_lookup_hash` IS NOT NULL
			AND NEW.`phone_lookup_key_version` IS NOT NULL
			AND length(NEW.`phone_ciphertext`) >= 22
			AND length(NEW.`phone_iv`) = 16
			AND length(NEW.`phone_key_version`) BETWEEN 1 AND 32
			AND length(NEW.`phone_lookup_hash`) = 43
			AND length(NEW.`phone_lookup_key_version`) BETWEEN 1 AND 32
			AND NEW.`phone_ciphertext` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`phone_iv` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`phone_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
		)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'user_profiles identity protection fields incomplete');
END;--> statement-breakpoint
CREATE TRIGGER `user_profiles_identity_update_guard`
BEFORE UPDATE OF
	`email_ciphertext`,`email_iv`,`email_key_version`,
	`email_lookup_hash`,`email_lookup_key_version`,
	`phone_ciphertext`,`phone_iv`,`phone_key_version`,
	`phone_lookup_hash`,`phone_lookup_key_version`
ON `user_profiles`
WHEN NOT (
	(
		(
			NEW.`email_ciphertext` IS NULL
			AND NEW.`email_iv` IS NULL
			AND NEW.`email_key_version` IS NULL
			AND NEW.`email_lookup_hash` IS NULL
			AND NEW.`email_lookup_key_version` IS NULL
		)
		OR
		(
			NEW.`email_ciphertext` IS NOT NULL
			AND NEW.`email_iv` IS NOT NULL
			AND NEW.`email_key_version` IS NOT NULL
			AND NEW.`email_lookup_hash` IS NOT NULL
			AND NEW.`email_lookup_key_version` IS NOT NULL
			AND length(NEW.`email_ciphertext`) >= 22
			AND length(NEW.`email_iv`) = 16
			AND length(NEW.`email_key_version`) BETWEEN 1 AND 32
			AND length(NEW.`email_lookup_hash`) = 43
			AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
			AND NEW.`email_ciphertext` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`email_iv` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
		)
	)
	AND
	(
		(
			NEW.`phone_ciphertext` IS NULL
			AND NEW.`phone_iv` IS NULL
			AND NEW.`phone_key_version` IS NULL
			AND NEW.`phone_lookup_hash` IS NULL
			AND NEW.`phone_lookup_key_version` IS NULL
		)
		OR
		(
			NEW.`phone_ciphertext` IS NOT NULL
			AND NEW.`phone_iv` IS NOT NULL
			AND NEW.`phone_key_version` IS NOT NULL
			AND NEW.`phone_lookup_hash` IS NOT NULL
			AND NEW.`phone_lookup_key_version` IS NOT NULL
			AND length(NEW.`phone_ciphertext`) >= 22
			AND length(NEW.`phone_iv`) = 16
			AND length(NEW.`phone_key_version`) BETWEEN 1 AND 32
			AND length(NEW.`phone_lookup_hash`) = 43
			AND length(NEW.`phone_lookup_key_version`) BETWEEN 1 AND 32
			AND NEW.`phone_ciphertext` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`phone_iv` NOT GLOB '*[^A-Za-z0-9_-]*'
			AND NEW.`phone_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
		)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'user_profiles identity protection fields incomplete');
END;
