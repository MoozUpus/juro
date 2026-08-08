ALTER TABLE `auth_otp_challenges` ADD `verification_locked_until` text;
--> statement-breakpoint
CREATE INDEX `auth_otp_email_verification_lock_idx`
ON `auth_otp_challenges` (`email_hash`,`verification_locked_until`);
--> statement-breakpoint
CREATE INDEX `auth_otp_keyed_email_verification_lock_idx`
ON `auth_otp_challenges` (
  `email_lookup_key_version`,
  `email_lookup_hash`,
  `verification_locked_until`
);
--> statement-breakpoint
CREATE TRIGGER `auth_otp_verification_lock_insert_guard`
BEFORE INSERT ON `auth_otp_challenges`
WHEN
  NEW.`verification_locked_until` IS NOT NULL
  AND NEW.`attempt_count` < NEW.`max_attempts`
BEGIN
  SELECT RAISE(
    ABORT,
    'OTP verification lock requires exhausted attempts'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `auth_otp_verification_lock_update_guard`
BEFORE UPDATE OF `attempt_count`,`max_attempts`,`verification_locked_until`
ON `auth_otp_challenges`
WHEN
  NEW.`verification_locked_until` IS NOT NULL
  AND NEW.`attempt_count` < NEW.`max_attempts`
BEGIN
  SELECT RAISE(
    ABORT,
    'OTP verification lock requires exhausted attempts'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `auth_otp_verification_lock_immutable_guard`
BEFORE UPDATE OF `verification_locked_until`
ON `auth_otp_challenges`
WHEN
  OLD.`verification_locked_until` IS NOT NULL
  AND NEW.`verification_locked_until` IS NOT OLD.`verification_locked_until`
BEGIN
  SELECT RAISE(
    ABORT,
    'OTP verification lock is immutable'
  );
END;
