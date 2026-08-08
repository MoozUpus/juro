-- Migration 0083: public-safe service incidents with immutable bilingual updates.
CREATE TABLE `system_status_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`public_reference` text NOT NULL,
	`state` text NOT NULL,
	`severity` text NOT NULL,
	`title_ru` text NOT NULL,
	`title_uz` text NOT NULL,
	`summary_ru` text NOT NULL,
	`summary_uz` text NOT NULL,
	`current_update_id` text NOT NULL,
	`started_at` text NOT NULL,
	`resolved_at` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `system_status_incident_reference_check` CHECK (`public_reference` GLOB 'INC-[A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9]'),
	CONSTRAINT `system_status_incident_state_check` CHECK (`state` IN ('investigating','identified','monitoring','resolved')),
	CONSTRAINT `system_status_incident_severity_check` CHECK (`severity` IN ('degraded','partial_outage','outage','maintenance')),
	CONSTRAINT `system_status_incident_title_ru_check` CHECK (length(trim(`title_ru`)) BETWEEN 3 AND 140),
	CONSTRAINT `system_status_incident_title_uz_check` CHECK (length(trim(`title_uz`)) BETWEEN 3 AND 140),
	CONSTRAINT `system_status_incident_summary_ru_check` CHECK (length(trim(`summary_ru`)) BETWEEN 10 AND 2000),
	CONSTRAINT `system_status_incident_summary_uz_check` CHECK (length(trim(`summary_uz`)) BETWEEN 10 AND 2000),
	CONSTRAINT `system_status_incident_resolution_check` CHECK ((`state`='resolved' AND `resolved_at` IS NOT NULL) OR (`state`<>'resolved' AND `resolved_at` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_status_incident_public_reference_uidx` ON `system_status_incidents` (`public_reference`);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_status_incident_current_update_uidx` ON `system_status_incidents` (`current_update_id`);
--> statement-breakpoint
CREATE INDEX `system_status_incident_timeline_idx` ON `system_status_incidents` (`state`,`started_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `system_status_incident_actor_guard`
BEFORE INSERT ON `system_status_incidents`
WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`created_by_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `system_status_incident_update_guard`
BEFORE UPDATE ON `system_status_incidents`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`public_reference`<>OLD.`public_reference`
  OR NEW.`severity`<>OLD.`severity`
  OR NEW.`title_ru`<>OLD.`title_ru`
  OR NEW.`title_uz`<>OLD.`title_uz`
  OR NEW.`summary_ru`<>OLD.`summary_ru`
  OR NEW.`summary_uz`<>OLD.`summary_uz`
  OR NEW.`started_at`<>OLD.`started_at`
  OR NEW.`created_by_user_id`<>OLD.`created_by_user_id`
  OR NEW.`created_at`<>OLD.`created_at`
  OR NOT (
    (OLD.`state`='investigating' AND NEW.`state` IN ('identified','monitoring','resolved'))
    OR (OLD.`state`='identified' AND NEW.`state` IN ('monitoring','resolved'))
    OR (OLD.`state`='monitoring' AND NEW.`state`='resolved')
  )
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_INCIDENT_UPDATE_FORBIDDEN');
END;
--> statement-breakpoint
CREATE TRIGGER `system_status_incident_no_delete`
BEFORE DELETE ON `system_status_incidents`
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_INCIDENT_DELETE_FORBIDDEN');
END;
--> statement-breakpoint
CREATE TABLE `system_status_incident_components` (
	`incident_id` text NOT NULL,
	`component_key` text NOT NULL,
	`impact` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY (`incident_id`,`component_key`),
	FOREIGN KEY (`incident_id`) REFERENCES `system_status_incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `system_status_component_key_check` CHECK (`component_key` IN ('platform','otp','ai','document_analysis','upload','document_builder','email','lawyer_area')),
	CONSTRAINT `system_status_component_impact_check` CHECK (`impact` IN ('degraded','partial_outage','outage','maintenance'))
);
--> statement-breakpoint
CREATE INDEX `system_status_incident_component_lookup_idx` ON `system_status_incident_components` (`component_key`,`impact`,`incident_id`);
--> statement-breakpoint
CREATE TRIGGER `system_status_incident_component_no_update`
BEFORE UPDATE ON `system_status_incident_components`
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_COMPONENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `system_status_incident_component_no_delete`
BEFORE DELETE ON `system_status_incident_components`
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_COMPONENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `system_status_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`state` text NOT NULL,
	`message_ru` text NOT NULL,
	`message_uz` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `system_status_incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `system_status_update_state_check` CHECK (`state` IN ('investigating','identified','monitoring','resolved')),
	CONSTRAINT `system_status_update_message_ru_check` CHECK (length(trim(`message_ru`)) BETWEEN 10 AND 2000),
	CONSTRAINT `system_status_update_message_uz_check` CHECK (length(trim(`message_uz`)) BETWEEN 10 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `system_status_updates_timeline_idx` ON `system_status_updates` (`incident_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `system_status_update_actor_guard`
BEFORE INSERT ON `system_status_updates`
WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`created_by_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_UPDATE_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `system_status_update_no_update`
BEFORE UPDATE ON `system_status_updates`
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_UPDATE_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `system_status_update_no_delete`
BEFORE DELETE ON `system_status_updates`
BEGIN
	SELECT RAISE(ABORT, 'SYSTEM_STATUS_UPDATE_IMMUTABLE');
END;
