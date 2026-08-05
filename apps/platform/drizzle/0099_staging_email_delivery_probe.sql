-- Migration 0099: content-free Resend acceptance evidence for an explicitly
-- enabled, staging-only operational probe. It deliberately contains no email
-- address, message body, provider request, or user/application linkage.
CREATE TABLE `staging_email_delivery_probes` (
	`probe_key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`error_code` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `staging_email_delivery_probe_key_check` CHECK (`probe_key` GLOB 'staging-resend-*' AND length(`probe_key`) BETWEEN 16 AND 120),
	CONSTRAINT `staging_email_delivery_probe_status_check` CHECK (`status` IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT `staging_email_delivery_probe_attempt_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `staging_email_delivery_probe_error_check` CHECK (`error_code` IS NULL OR (`error_code` GLOB '[A-Z][A-Z0-9_]*' AND length(`error_code`) BETWEEN 3 AND 80)),
	CONSTRAINT `staging_email_delivery_probe_evidence_check` CHECK (
		(`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `error_code` IS NULL AND `sent_at` IS NULL)
		OR (`status`='retrying' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
		OR (`status`='sent' AND `provider_message_id` IS NOT NULL AND `error_code` IS NULL AND `sent_at` IS NOT NULL)
		OR (`status`='failed' AND `provider_message_id` IS NULL AND `error_code` IS NOT NULL AND `sent_at` IS NULL)
	)
);--> statement-breakpoint
CREATE TRIGGER `staging_email_delivery_probe_identity_immutable`
BEFORE UPDATE ON `staging_email_delivery_probes`
WHEN NEW.`probe_key` IS NOT OLD.`probe_key`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT,'STAGING_EMAIL_DELIVERY_PROBE_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `staging_email_delivery_probe_transition_guard`
BEFORE UPDATE ON `staging_email_delivery_probes`
WHEN NOT (
	(OLD.`status` IN ('pending','retrying') AND NEW.`status`='sending'
		AND NEW.`attempt_count`=OLD.`attempt_count`+1
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NULL AND NEW.`sent_at` IS NULL)
	OR (OLD.`status`='sending' AND NEW.`status`='retrying'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NOT NULL AND NEW.`sent_at` IS NULL)
	OR (OLD.`status`='sending' AND NEW.`status`='failed'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`provider_message_id` IS NULL AND NEW.`error_code` IS NOT NULL AND NEW.`sent_at` IS NULL)
	OR (OLD.`status`='sending' AND NEW.`status`='sent'
		AND NEW.`attempt_count`=OLD.`attempt_count`
		AND NEW.`provider_message_id` IS NOT NULL AND NEW.`error_code` IS NULL AND NEW.`sent_at` IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT,'STAGING_EMAIL_DELIVERY_PROBE_TRANSITION_INVALID');
END;
