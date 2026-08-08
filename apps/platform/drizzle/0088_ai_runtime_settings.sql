-- Migration 0088: immutable, MFA-bound safe AI runtime configuration.
CREATE TABLE `ai_runtime_config_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`version` integer NOT NULL,
	`openai_chat_model` text NOT NULL,
	`openai_deep_model` text NOT NULL,
	`anthropic_chat_fallback_model` text NOT NULL,
	`anthropic_document_model` text NOT NULL,
	`openai_document_fallback_model` text NOT NULL,
	`response_tone` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`actor_assignment_id` text NOT NULL,
	`actor_mfa_verified_at` text NOT NULL,
	`previous_hash` text NOT NULL,
	`config_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `ai_runtime_config_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_runtime_config_version_check` CHECK (`version`>0),
	CONSTRAINT `ai_runtime_config_model_check` CHECK (
		length(`openai_chat_model`) BETWEEN 1 AND 120 AND `openai_chat_model` NOT GLOB '*[^A-Za-z0-9._:-]*'
		AND length(`openai_deep_model`) BETWEEN 1 AND 120 AND `openai_deep_model` NOT GLOB '*[^A-Za-z0-9._:-]*'
		AND length(`anthropic_chat_fallback_model`) BETWEEN 1 AND 120 AND `anthropic_chat_fallback_model` NOT GLOB '*[^A-Za-z0-9._:-]*'
		AND length(`anthropic_document_model`) BETWEEN 1 AND 120 AND `anthropic_document_model` NOT GLOB '*[^A-Za-z0-9._:-]*'
		AND length(`openai_document_fallback_model`) BETWEEN 1 AND 120 AND `openai_document_fallback_model` NOT GLOB '*[^A-Za-z0-9._:-]*'
	),
	CONSTRAINT `ai_runtime_config_tone_check` CHECK (`response_tone` IN ('clear','formal','concise')),
	CONSTRAINT `ai_runtime_config_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
	CONSTRAINT `ai_runtime_config_hash_check` CHECK (`config_hash` GLOB replace(hex(zeroblob(32)),'0','[a-f0-9]')),
	CONSTRAINT `ai_runtime_event_hash_check` CHECK (`event_hash` GLOB replace(hex(zeroblob(32)),'0','[a-f0-9]')),
	CONSTRAINT `ai_runtime_previous_hash_check` CHECK (`previous_hash` GLOB replace(hex(zeroblob(32)),'0','[a-f0-9]')),
	CONSTRAINT `ai_runtime_mfa_time_check` CHECK (`actor_mfa_verified_at`<=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runtime_config_environment_version_uidx`
ON `ai_runtime_config_versions` (`environment`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runtime_config_event_hash_uidx`
ON `ai_runtime_config_versions` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runtime_config_chain_uidx`
ON `ai_runtime_config_versions` (`environment`,`previous_hash`);
--> statement-breakpoint
CREATE INDEX `ai_runtime_config_created_idx`
ON `ai_runtime_config_versions` (`environment`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_runtime_config_sequence_guard`
BEFORE INSERT ON `ai_runtime_config_versions`
WHEN NEW.`version`<>(SELECT coalesce(max(`version`),0)+1 FROM `ai_runtime_config_versions` WHERE `environment`=NEW.`environment`)
BEGIN
	SELECT RAISE(ABORT, 'AI_RUNTIME_CONFIG_VERSION_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_runtime_config_chain_guard`
BEFORE INSERT ON `ai_runtime_config_versions`
WHEN (
	NOT EXISTS (SELECT 1 FROM `ai_runtime_config_versions` WHERE `environment`=NEW.`environment`)
	AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000'
) OR (
	EXISTS (SELECT 1 FROM `ai_runtime_config_versions` WHERE `environment`=NEW.`environment`)
	AND NOT EXISTS (
		SELECT 1 FROM `ai_runtime_config_versions` parent
		WHERE parent.`environment`=NEW.`environment` AND parent.`event_hash`=NEW.`previous_hash`
		AND NOT EXISTS (
			SELECT 1 FROM `ai_runtime_config_versions` child
			WHERE child.`environment`=parent.`environment` AND child.`previous_hash`=parent.`event_hash`
		)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'AI_RUNTIME_CONFIG_CHAIN_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_runtime_config_actor_guard`
BEFORE INSERT ON `ai_runtime_config_versions`
WHEN NOT EXISTS (
	SELECT 1
	FROM `auth_sessions` session
	JOIN `platform_staff_assignments` assignment
	  ON assignment.`id`=NEW.`actor_assignment_id` AND assignment.`user_id`=NEW.`actor_user_id`
	LEFT JOIN `auth_devices` device ON device.`id`=session.`device_id`
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
		SELECT 1 FROM `auth_totp_credentials` totp
		WHERE totp.`user_id`=NEW.`actor_user_id`
		  AND totp.`status`='active' AND totp.`verified_at` IS NOT NULL
		  AND totp.`verified_at`<=NEW.`actor_mfa_verified_at` AND totp.`disabled_at` IS NULL
	  )
)
BEGIN
	SELECT RAISE(ABORT, 'AI_RUNTIME_CONFIG_ACCESS_DENIED');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_runtime_config_no_update`
BEFORE UPDATE ON `ai_runtime_config_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_RUNTIME_CONFIG_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_runtime_config_no_delete`
BEFORE DELETE ON `ai_runtime_config_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_RUNTIME_CONFIG_IMMUTABLE');
END;
