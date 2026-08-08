ALTER TABLE `account_deletion_challenges` ADD `email_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `account_deletion_challenges` ADD `email_lookup_key_version` text;--> statement-breakpoint
ALTER TABLE `account_deletion_challenges` ADD `code_hmac` text;--> statement-breakpoint
ALTER TABLE `account_deletion_challenges` ADD `code_key_version` text;--> statement-breakpoint
ALTER TABLE `auth_otp_challenges` ADD `email_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `auth_otp_challenges` ADD `email_lookup_key_version` text;--> statement-breakpoint
ALTER TABLE `auth_otp_challenges` ADD `code_hmac` text;--> statement-breakpoint
ALTER TABLE `auth_otp_challenges` ADD `code_key_version` text;--> statement-breakpoint
ALTER TABLE `auth_otp_challenges` ADD `request_ip_lookup_hash` text;--> statement-breakpoint
ALTER TABLE `auth_otp_challenges` ADD `request_ip_lookup_key_version` text;--> statement-breakpoint
CREATE INDEX `auth_otp_email_lookup_idx` ON `auth_otp_challenges` (`email_lookup_key_version`,`email_lookup_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_otp_ip_lookup_created_idx` ON `auth_otp_challenges` (`request_ip_lookup_key_version`,`request_ip_lookup_hash`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `auth_otp_challenge_evidence_insert_guard`
BEFORE INSERT ON `auth_otp_challenges`
WHEN NOT (
  (
    (
      NEW.`email_lookup_hash` IS NULL
      AND NEW.`email_lookup_key_version` IS NULL
      AND NEW.`code_hmac` IS NULL
      AND NEW.`code_key_version` IS NULL
    )
    OR
    (
      NEW.`email_lookup_hash` IS NOT NULL
      AND NEW.`email_lookup_key_version` IS NOT NULL
      AND NEW.`code_hmac` IS NOT NULL
      AND NEW.`code_key_version` IS NOT NULL
      AND length(NEW.`email_lookup_hash`) = 43
      AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
      AND length(NEW.`code_hmac`) = 43
      AND length(NEW.`code_key_version`) BETWEEN 1 AND 32
      AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NEW.`email_lookup_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
      AND NEW.`code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NEW.`code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    )
  )
  AND
  (
    (
      NEW.`request_ip_lookup_hash` IS NULL
      AND NEW.`request_ip_lookup_key_version` IS NULL
    )
    OR
    (
      NEW.`request_ip_lookup_hash` IS NOT NULL
      AND NEW.`request_ip_lookup_key_version` IS NOT NULL
      AND length(NEW.`request_ip_lookup_hash`) = 43
      AND length(NEW.`request_ip_lookup_key_version`) BETWEEN 1 AND 32
      AND NEW.`request_ip_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NEW.`request_ip_lookup_key_version`
        NOT GLOB '*[^A-Za-z0-9._-]*'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'auth OTP challenge evidence incomplete');
END;--> statement-breakpoint
CREATE TRIGGER `auth_otp_challenge_evidence_update_guard`
BEFORE UPDATE OF
  `email_lookup_hash`,`email_lookup_key_version`,
  `code_hmac`,`code_key_version`,
  `request_ip_lookup_hash`,`request_ip_lookup_key_version`
ON `auth_otp_challenges`
WHEN NOT (
  (
    (
      NEW.`email_lookup_hash` IS NULL
      AND NEW.`email_lookup_key_version` IS NULL
      AND NEW.`code_hmac` IS NULL
      AND NEW.`code_key_version` IS NULL
    )
    OR
    (
      NEW.`email_lookup_hash` IS NOT NULL
      AND NEW.`email_lookup_key_version` IS NOT NULL
      AND NEW.`code_hmac` IS NOT NULL
      AND NEW.`code_key_version` IS NOT NULL
      AND length(NEW.`email_lookup_hash`) = 43
      AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
      AND length(NEW.`code_hmac`) = 43
      AND length(NEW.`code_key_version`) BETWEEN 1 AND 32
      AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NEW.`email_lookup_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
      AND NEW.`code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NEW.`code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    )
  )
  AND
  (
    (
      NEW.`request_ip_lookup_hash` IS NULL
      AND NEW.`request_ip_lookup_key_version` IS NULL
    )
    OR
    (
      NEW.`request_ip_lookup_hash` IS NOT NULL
      AND NEW.`request_ip_lookup_key_version` IS NOT NULL
      AND length(NEW.`request_ip_lookup_hash`) = 43
      AND length(NEW.`request_ip_lookup_key_version`) BETWEEN 1 AND 32
      AND NEW.`request_ip_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NEW.`request_ip_lookup_key_version`
        NOT GLOB '*[^A-Za-z0-9._-]*'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'auth OTP challenge evidence incomplete');
END;--> statement-breakpoint
CREATE TRIGGER `account_deletion_challenge_evidence_insert_guard`
BEFORE INSERT ON `account_deletion_challenges`
WHEN NOT (
  (
    NEW.`email_lookup_hash` IS NULL
    AND NEW.`email_lookup_key_version` IS NULL
    AND NEW.`code_hmac` IS NULL
    AND NEW.`code_key_version` IS NULL
  )
  OR
  (
    NEW.`email_lookup_hash` IS NOT NULL
    AND NEW.`email_lookup_key_version` IS NOT NULL
    AND NEW.`code_hmac` IS NOT NULL
    AND NEW.`code_key_version` IS NOT NULL
    AND length(NEW.`email_lookup_hash`) = 43
    AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`code_hmac`) = 43
    AND length(NEW.`code_key_version`) BETWEEN 1 AND 32
    AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`email_lookup_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account deletion challenge evidence incomplete'
  );
END;--> statement-breakpoint
CREATE TRIGGER `account_deletion_challenge_evidence_update_guard`
BEFORE UPDATE OF
  `email_lookup_hash`,`email_lookup_key_version`,
  `code_hmac`,`code_key_version`
ON `account_deletion_challenges`
WHEN NOT (
  (
    NEW.`email_lookup_hash` IS NULL
    AND NEW.`email_lookup_key_version` IS NULL
    AND NEW.`code_hmac` IS NULL
    AND NEW.`code_key_version` IS NULL
  )
  OR
  (
    NEW.`email_lookup_hash` IS NOT NULL
    AND NEW.`email_lookup_key_version` IS NOT NULL
    AND NEW.`code_hmac` IS NOT NULL
    AND NEW.`code_key_version` IS NOT NULL
    AND length(NEW.`email_lookup_hash`) = 43
    AND length(NEW.`email_lookup_key_version`) BETWEEN 1 AND 32
    AND length(NEW.`code_hmac`) = 43
    AND length(NEW.`code_key_version`) BETWEEN 1 AND 32
    AND NEW.`email_lookup_hash` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`email_lookup_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
    AND NEW.`code_hmac` NOT GLOB '*[^A-Za-z0-9_-]*'
    AND NEW.`code_key_version` NOT GLOB '*[^A-Za-z0-9._-]*'
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account deletion challenge evidence incomplete'
  );
END;
