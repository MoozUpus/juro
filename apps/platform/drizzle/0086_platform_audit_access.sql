-- Migration 0086: tamper-evident access evidence for the platform audit log.
CREATE TABLE `platform_audit_access_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`actor_assignment_id` text NOT NULL,
	`capability` text NOT NULL,
	`request_action` text NOT NULL,
	`filters_hash` text NOT NULL,
	`result_count` integer NOT NULL,
	`result_digest` text NOT NULL,
	`actor_mfa_verified_at` text NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `platform_audit_access_capability_check` CHECK (`capability`='staff.security.audit'),
	CONSTRAINT `platform_audit_access_action_check` CHECK (`request_action` IN ('query','export')),
	CONSTRAINT `platform_audit_access_count_check` CHECK (`result_count` BETWEEN 0 AND 500),
	CONSTRAINT `platform_audit_access_filters_hash_check` CHECK (`filters_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')),
	CONSTRAINT `platform_audit_access_result_digest_check` CHECK (`result_digest` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')),
	CONSTRAINT `platform_audit_access_previous_hash_check` CHECK (`previous_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')),
	CONSTRAINT `platform_audit_access_event_hash_check` CHECK (`event_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')),
	CONSTRAINT `platform_audit_access_mfa_time_check` CHECK (`actor_mfa_verified_at`<=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_audit_access_event_hash_uidx`
ON `platform_audit_access_events` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_audit_access_chain_uidx`
ON `platform_audit_access_events` (`actor_user_id`,`previous_hash`);
--> statement-breakpoint
CREATE INDEX `platform_audit_access_actor_created_idx`
ON `platform_audit_access_events` (`actor_user_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `platform_audit_access_chain_guard`
BEFORE INSERT ON `platform_audit_access_events`
WHEN (
	NOT EXISTS (
		SELECT 1 FROM `platform_audit_access_events`
		WHERE `actor_user_id`=NEW.`actor_user_id`
	)
	AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000'
)
OR (
	EXISTS (
		SELECT 1 FROM `platform_audit_access_events`
		WHERE `actor_user_id`=NEW.`actor_user_id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `platform_audit_access_events` AS parent
		WHERE parent.`actor_user_id`=NEW.`actor_user_id`
		  AND parent.`event_hash`=NEW.`previous_hash`
		  AND NOT EXISTS (
			SELECT 1 FROM `platform_audit_access_events` AS child
			WHERE child.`actor_user_id`=parent.`actor_user_id`
			  AND child.`previous_hash`=parent.`event_hash`
		  )
	)
)
BEGIN
	SELECT RAISE(ABORT, 'PLATFORM_AUDIT_ACCESS_CHAIN_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `platform_audit_access_actor_guard`
BEFORE INSERT ON `platform_audit_access_events`
WHEN NOT EXISTS (
	SELECT 1
	FROM `auth_sessions` AS session
	JOIN `platform_staff_assignments` AS assignment
	  ON assignment.`id`=NEW.`actor_assignment_id`
	 AND assignment.`user_id`=NEW.`actor_user_id`
	LEFT JOIN `auth_devices` AS device ON device.`id`=session.`device_id`
	WHERE session.`id`=NEW.`actor_session_id`
	  AND session.`user_id`=NEW.`actor_user_id`
	  AND session.`revoked_at` IS NULL
	  AND session.`assurance_level`='mfa'
	  AND session.`mfa_verified_at`=NEW.`actor_mfa_verified_at`
	  AND unixepoch(NEW.`created_at`)-unixepoch(session.`mfa_verified_at`) BETWEEN 0 AND 900
	  AND session.`expires_at`>NEW.`created_at`
	  AND coalesce(session.`idle_expires_at`,session.`expires_at`)>NEW.`created_at`
	  AND (session.`device_id` IS NULL OR (device.`id` IS NOT NULL AND device.`revoked_at` IS NULL))
	  AND assignment.`role`='administrator'
	  AND assignment.`granted_at`<=NEW.`created_at`
	  AND assignment.`expires_at`>NEW.`created_at`
	  AND assignment.`revoked_at` IS NULL
	  AND EXISTS (
		SELECT 1 FROM `auth_totp_credentials` AS totp
		WHERE totp.`user_id`=NEW.`actor_user_id`
		  AND totp.`status`='active'
		  AND totp.`verified_at` IS NOT NULL
		  AND totp.`verified_at`<=NEW.`actor_mfa_verified_at`
		  AND totp.`disabled_at` IS NULL
	  )
)
BEGIN
	SELECT RAISE(ABORT, 'PLATFORM_AUDIT_ACCESS_DENIED');
END;
--> statement-breakpoint
CREATE TRIGGER `platform_audit_access_no_update`
BEFORE UPDATE ON `platform_audit_access_events`
BEGIN
	SELECT RAISE(ABORT, 'PLATFORM_AUDIT_ACCESS_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `platform_audit_access_no_delete`
BEFORE DELETE ON `platform_audit_access_events`
BEGIN
	SELECT RAISE(ABORT, 'PLATFORM_AUDIT_ACCESS_IMMUTABLE');
END;
