-- Migration 0109: independent admin-domain tickets, sessions, and append-only audit.
-- These records contain identifiers and token hashes only; raw browser tokens
-- are never written to D1.
CREATE TABLE `admin_handoff_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `token_hash` text NOT NULL,
  `staff_user_id` text NOT NULL,
  `source_session_id` text NOT NULL,
  `source_mfa_verified_at` text NOT NULL,
  `destination_origin` text NOT NULL,
  `expires_at` text NOT NULL,
  `redeemed_at` text,
  `redeemed_admin_session_id` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`staff_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`source_session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `admin_handoff_tickets_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `admin_handoff_tickets_hash_check` CHECK (length(`token_hash`)=64 AND `token_hash` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `admin_handoff_tickets_destination_check` CHECK (substr(`destination_origin`,1,8)='https://'),
  CONSTRAINT `admin_handoff_tickets_expiry_check` CHECK (`expires_at`>`created_at`),
  CONSTRAINT `admin_handoff_tickets_redemption_check` CHECK ((`redeemed_at` IS NULL AND `redeemed_admin_session_id` IS NULL) OR (`redeemed_at` IS NOT NULL AND `redeemed_admin_session_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_handoff_tickets_token_uidx` ON `admin_handoff_tickets` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `admin_handoff_tickets_session_idx` ON `admin_handoff_tickets` (`source_session_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `admin_domain_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `staff_user_id` text NOT NULL,
  `source_session_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `source_mfa_verified_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`staff_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`source_session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `admin_domain_sessions_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `admin_domain_sessions_hash_check` CHECK (length(`token_hash`)=64 AND `token_hash` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `admin_domain_sessions_expiry_check` CHECK (`expires_at`>`created_at` AND `last_seen_at`>=`created_at`),
  CONSTRAINT `admin_domain_sessions_revocation_check` CHECK (`revoked_at` IS NULL OR `revoked_at`>=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_domain_sessions_token_uidx` ON `admin_domain_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `admin_domain_sessions_staff_idx` ON `admin_domain_sessions` (`staff_user_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `admin_domain_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `admin_session_id` text,
  `actor_user_id` text,
  `action` text NOT NULL,
  `entity_type` text,
  `entity_id` text,
  `metadata_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`admin_session_id`) REFERENCES `admin_domain_sessions`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `admin_domain_audit_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `admin_domain_audit_metadata_check` CHECK (json_valid(`metadata_json`))
);
--> statement-breakpoint
CREATE INDEX `admin_domain_audit_actor_idx` ON `admin_domain_audit_events` (`actor_user_id`,`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `admin_domain_audit_entity_idx` ON `admin_domain_audit_events` (`entity_type`,`entity_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `admin_domain_audit_events_no_update`
BEFORE UPDATE ON `admin_domain_audit_events`
BEGIN
  SELECT RAISE(ABORT, 'admin domain audit events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `admin_domain_audit_events_no_delete`
BEFORE DELETE ON `admin_domain_audit_events`
BEGIN
  SELECT RAISE(ABORT, 'admin domain audit events are append-only');
END;
