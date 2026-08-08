-- Migration 0074: tenant-bound, append-only document-analysis case links.
-- Expand-only. The analysis row stores the current projection while immutable
-- events and triggers fence every transition and write case/audit evidence.
ALTER TABLE `document_analyses` ADD COLUMN `case_id` text REFERENCES `cases`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `document_analyses` ADD COLUMN `case_link_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `document_analyses` ADD COLUMN `case_linked_by_user_id` text REFERENCES `user_profiles`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `document_analyses_case_idx` ON `document_analyses` (`workspace_id`,`case_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `analysis_case_link_events` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `from_case_id` text,
  `to_case_id` text,
  `mutation_version` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `analysis_case_link_events_change_check` CHECK (NOT (`from_case_id` IS `to_case_id`)),
  CONSTRAINT `analysis_case_link_events_version_check` CHECK (`mutation_version` >= 1),
  CONSTRAINT `analysis_case_link_events_hash_check` CHECK (length(`request_hash`) = 64),
  CONSTRAINT `analysis_case_link_events_idempotency_check` CHECK (length(`idempotency_key`) BETWEEN 16 AND 180)
);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_case_link_events_version_uidx` ON `analysis_case_link_events` (`analysis_id`,`mutation_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_case_link_events_idempotency_uidx` ON `analysis_case_link_events` (`workspace_id`,`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `analysis_case_link_events_case_idx` ON `analysis_case_link_events` (`workspace_id`,`to_case_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_insert_guard`
BEFORE INSERT ON `analysis_case_link_events`
WHEN NEW.`actor_user_id` <> NEW.`owner_user_id`
  OR NOT EXISTS (
    SELECT 1 FROM `document_analyses` analysis
    WHERE analysis.`id` = NEW.`analysis_id`
      AND analysis.`workspace_id` = NEW.`workspace_id`
      AND analysis.`owner_user_id` = NEW.`owner_user_id`
      AND analysis.`case_id` IS NEW.`from_case_id`
      AND analysis.`case_link_revision` + 1 = NEW.`mutation_version`
  )
  OR (NEW.`from_case_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `cases` source_case
    WHERE source_case.`id` = NEW.`from_case_id`
      AND source_case.`workspace_id` = NEW.`workspace_id`
  ))
  OR (NEW.`to_case_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `cases` target_case
    WHERE target_case.`id` = NEW.`to_case_id`
      AND target_case.`workspace_id` = NEW.`workspace_id`
      AND target_case.`archived_at` IS NULL
  ))
BEGIN
  SELECT RAISE(ABORT, 'analysis_case_link_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `document_analyses_case_projection_guard`
BEFORE UPDATE OF `case_id`,`case_link_revision`,`case_linked_by_user_id` ON `document_analyses`
WHEN NOT EXISTS (
  SELECT 1 FROM `analysis_case_link_events` event
  WHERE event.`analysis_id` = NEW.`id`
    AND event.`workspace_id` = NEW.`workspace_id`
    AND event.`owner_user_id` = NEW.`owner_user_id`
    AND event.`actor_user_id` IS NEW.`case_linked_by_user_id`
    AND event.`from_case_id` IS OLD.`case_id`
    AND event.`to_case_id` IS NEW.`case_id`
    AND event.`mutation_version` = NEW.`case_link_revision`
    AND NEW.`case_link_revision` = OLD.`case_link_revision` + 1
)
BEGIN
  SELECT RAISE(ABORT, 'document_analysis_case_projection_guard');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_project`
AFTER INSERT ON `analysis_case_link_events`
BEGIN
  UPDATE `document_analyses`
  SET `case_id` = NEW.`to_case_id`,
      `case_link_revision` = NEW.`mutation_version`,
      `case_linked_by_user_id` = NEW.`actor_user_id`,
      `updated_at` = NEW.`created_at`
  WHERE `id` = NEW.`analysis_id`
    AND `workspace_id` = NEW.`workspace_id`
    AND `owner_user_id` = NEW.`owner_user_id`
    AND `case_id` IS NEW.`from_case_id`
    AND `case_link_revision` = NEW.`mutation_version` - 1;
END;--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_case_unlinked`
AFTER INSERT ON `analysis_case_link_events`
WHEN NEW.`from_case_id` IS NOT NULL
BEGIN
  INSERT INTO `case_events` (`id`,`case_id`,`actor_user_id`,`event_type`,`metadata_json`,`created_at`)
  VALUES (NEW.id || ':unlinked',NEW.from_case_id,NEW.actor_user_id,'analysis_unlinked',json_object('analysisId',NEW.analysis_id,'mutationVersion',NEW.mutation_version),NEW.created_at);
END;--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_case_linked`
AFTER INSERT ON `analysis_case_link_events`
WHEN NEW.`to_case_id` IS NOT NULL
BEGIN
  INSERT INTO `case_events` (`id`,`case_id`,`actor_user_id`,`event_type`,`metadata_json`,`created_at`)
  VALUES (NEW.id || ':linked',NEW.to_case_id,NEW.actor_user_id,'analysis_linked',json_object('analysisId',NEW.analysis_id,'mutationVersion',NEW.mutation_version),NEW.created_at);
END;--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_audit`
AFTER INSERT ON `analysis_case_link_events`
BEGIN
  INSERT INTO `workspace_audit_events` (`id`,`workspace_id`,`actor_user_id`,`entity_type`,`entity_id`,`action`,`metadata_json`,`created_at`)
  VALUES (NEW.id || ':audit',NEW.workspace_id,NEW.actor_user_id,'document_analysis',NEW.analysis_id,'analysis_case_link_changed',json_object('fromCaseId',NEW.from_case_id,'toCaseId',NEW.to_case_id,'mutationVersion',NEW.mutation_version),NEW.created_at);
END;--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_no_update`
BEFORE UPDATE ON `analysis_case_link_events`
BEGIN
  SELECT RAISE(ABORT, 'analysis_case_link_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_case_link_events_no_delete`
BEFORE DELETE ON `analysis_case_link_events`
WHEN EXISTS (SELECT 1 FROM `document_analyses` WHERE `id` = OLD.`analysis_id`)
BEGIN
  SELECT RAISE(ABORT, 'analysis_case_link_event_immutable');
END;
