ALTER TABLE `document_invitations` ADD `target_identifier_kind` text;--> statement-breakpoint
ALTER TABLE `document_invitations` ADD `target_identifier_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `document_invitations` ADD `target_identifier_lookup_key_version` text;--> statement-breakpoint
CREATE INDEX `document_invitations_target_lookup_idx` ON `document_invitations` (`target_identifier_kind`,`target_identifier_lookup_key_version`,`target_identifier_lookup_hash`) WHERE "document_invitations"."target_identifier_lookup_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `email_ciphertext` text;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `email_iv` text;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `email_key_version` text;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `email_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `email_lookup_key_version` text;--> statement-breakpoint
CREATE INDEX `workspace_invitations_email_lookup_idx` ON `workspace_invitations` (`workspace_id`,`email_lookup_key_version`,`email_lookup_hash`) WHERE "workspace_invitations"."email_lookup_hash" IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `workspace_invitations_identity_insert_guard`
BEFORE INSERT ON `workspace_invitations`
WHEN NOT (
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
BEGIN
  SELECT RAISE(
    ABORT,
    'workspace invitation identity protection fields incomplete'
  );
END;--> statement-breakpoint
CREATE TRIGGER `workspace_invitations_identity_update_guard`
BEFORE UPDATE OF
  `email_ciphertext`,`email_iv`,`email_key_version`,
  `email_lookup_hash`,`email_lookup_key_version`
ON `workspace_invitations`
WHEN NOT (
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
BEGIN
  SELECT RAISE(
    ABORT,
    'workspace invitation identity protection fields incomplete'
  );
END;--> statement-breakpoint
CREATE TRIGGER `document_invitations_identity_insert_guard`
BEFORE INSERT ON `document_invitations`
WHEN NOT (
  (
    NEW.`target_identifier_kind` IS NULL
    AND NEW.`target_identifier_lookup_hash` IS NULL
    AND NEW.`target_identifier_lookup_key_version` IS NULL
  )
  OR
  (
    NEW.`target_identifier_kind` IN ('email','phone')
    AND NEW.`target_identifier_lookup_hash` IS NOT NULL
    AND NEW.`target_identifier_lookup_key_version` IS NOT NULL
    AND length(NEW.`target_identifier_lookup_hash`) = 43
    AND length(NEW.`target_identifier_lookup_key_version`) BETWEEN 1 AND 32
    AND NEW.`target_identifier_lookup_hash`
      NOT GLOB '*[^A-Za-z0-9_-]*'
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'document invitation identity protection fields incomplete'
  );
END;--> statement-breakpoint
CREATE TRIGGER `document_invitations_identity_update_guard`
BEFORE UPDATE OF
  `target_identifier_kind`,`target_identifier_lookup_hash`,
  `target_identifier_lookup_key_version`
ON `document_invitations`
WHEN NOT (
  (
    NEW.`target_identifier_kind` IS NULL
    AND NEW.`target_identifier_lookup_hash` IS NULL
    AND NEW.`target_identifier_lookup_key_version` IS NULL
  )
  OR
  (
    NEW.`target_identifier_kind` IN ('email','phone')
    AND NEW.`target_identifier_lookup_hash` IS NOT NULL
    AND NEW.`target_identifier_lookup_key_version` IS NOT NULL
    AND length(NEW.`target_identifier_lookup_hash`) = 43
    AND length(NEW.`target_identifier_lookup_key_version`) BETWEEN 1 AND 32
    AND NEW.`target_identifier_lookup_hash`
      NOT GLOB '*[^A-Za-z0-9_-]*'
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'document invitation identity protection fields incomplete'
  );
END;
