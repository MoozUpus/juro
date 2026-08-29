-- Migration 0145: give lower-trust general web research an independent,
-- append-only operator kill switch.
CREATE TABLE `operational_feature_flag_versions_next` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`feature_key` text NOT NULL,
	`version` integer NOT NULL,
	`enabled` integer NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`previous_event_hash` text,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `operational_feature_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `operational_feature_key_check` CHECK (`feature_key` IN ('ai_chat','ai_openai_primary','ai_anthropic_fallback','ai_lex_web_discovery','ai_secondary_web_research','document_analysis_upload','lawyer_handoff','voice_mode')),
	CONSTRAINT `operational_feature_version_check` CHECK (`version` > 0),
	CONSTRAINT `operational_feature_enabled_check` CHECK (`enabled` IN (0,1)),
	CONSTRAINT `operational_feature_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
	CONSTRAINT `operational_feature_previous_hash_check` CHECK (`previous_event_hash` IS NULL OR `previous_event_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')),
	CONSTRAINT `operational_feature_event_hash_check` CHECK (`event_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]'))
);
--> statement-breakpoint
INSERT INTO `operational_feature_flag_versions_next`
(`id`,`environment`,`feature_key`,`version`,`enabled`,`reason`,`actor_user_id`,`previous_event_hash`,`event_hash`,`created_at`)
SELECT `id`,`environment`,`feature_key`,`version`,`enabled`,`reason`,`actor_user_id`,`previous_event_hash`,`event_hash`,`created_at`
FROM `operational_feature_flag_versions`;
--> statement-breakpoint
DROP TRIGGER `operational_feature_actor_guard`;
--> statement-breakpoint
DROP TRIGGER `operational_feature_sequence_guard`;
--> statement-breakpoint
DROP TRIGGER `operational_feature_no_update`;
--> statement-breakpoint
DROP TRIGGER `operational_feature_no_delete`;
--> statement-breakpoint
DROP TABLE `operational_feature_flag_versions`;
--> statement-breakpoint
ALTER TABLE `operational_feature_flag_versions_next` RENAME TO `operational_feature_flag_versions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_feature_environment_key_version_uidx`
ON `operational_feature_flag_versions` (`environment`,`feature_key`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_feature_event_hash_uidx`
ON `operational_feature_flag_versions` (`event_hash`);
--> statement-breakpoint
CREATE INDEX `operational_feature_latest_idx`
ON `operational_feature_flag_versions` (`environment`,`feature_key`,`version` DESC);
--> statement-breakpoint
CREATE TRIGGER `operational_feature_actor_guard`
BEFORE INSERT ON `operational_feature_flag_versions`
WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`actor_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'OPERATIONAL_FEATURE_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `operational_feature_sequence_guard`
BEFORE INSERT ON `operational_feature_flag_versions`
WHEN NEW.`version` <> COALESCE((
	SELECT MAX(`version`) + 1 FROM `operational_feature_flag_versions`
	WHERE `environment`=NEW.`environment` AND `feature_key`=NEW.`feature_key`
), 1)
OR COALESCE(NEW.`previous_event_hash`,'') <> COALESCE((
	SELECT `event_hash` FROM `operational_feature_flag_versions`
	WHERE `environment`=NEW.`environment` AND `feature_key`=NEW.`feature_key`
	ORDER BY `version` DESC LIMIT 1
),'')
BEGIN
	SELECT RAISE(ABORT, 'OPERATIONAL_FEATURE_SEQUENCE_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `operational_feature_no_update`
BEFORE UPDATE ON `operational_feature_flag_versions`
BEGIN
	SELECT RAISE(ABORT, 'OPERATIONAL_FEATURE_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `operational_feature_no_delete`
BEFORE DELETE ON `operational_feature_flag_versions`
BEGIN
	SELECT RAISE(ABORT, 'OPERATIONAL_FEATURE_IMMUTABLE');
END;
