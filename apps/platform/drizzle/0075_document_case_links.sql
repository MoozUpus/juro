-- Migration 0075: tenant-bound, append-only document case links.
-- Expand-only. Existing case_id values remain valid at revision zero. Every
-- transition after this migration is fenced by an immutable event and clears
-- a plan-step reference that could otherwise belong to the previous case.
ALTER TABLE `documents` ADD COLUMN `case_link_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD COLUMN `case_linked_by_user_id` text REFERENCES `user_profiles`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `documents_workspace_case_idx` ON `documents` (`workspace_id`,`case_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `document_case_link_events` (
  `id` text PRIMARY KEY NOT NULL,
  `document_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `from_case_id` text,
  `to_case_id` text,
  `mutation_version` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `document_case_link_events_change_check` CHECK (NOT (`from_case_id` IS `to_case_id`)),
  CONSTRAINT `document_case_link_events_version_check` CHECK (`mutation_version` >= 1),
  CONSTRAINT `document_case_link_events_hash_check` CHECK (length(`request_hash`) = 64),
  CONSTRAINT `document_case_link_events_idempotency_check` CHECK (length(`idempotency_key`) BETWEEN 16 AND 180)
);--> statement-breakpoint
CREATE UNIQUE INDEX `document_case_link_events_version_uidx` ON `document_case_link_events` (`document_id`,`mutation_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_case_link_events_idempotency_uidx` ON `document_case_link_events` (`workspace_id`,`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `document_case_link_events_case_idx` ON `document_case_link_events` (`workspace_id`,`to_case_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_insert_guard`
BEFORE INSERT ON `document_case_link_events`
WHEN NEW.`actor_user_id` <> NEW.`owner_user_id`
  OR NOT EXISTS (
    SELECT 1 FROM `documents` document
    WHERE document.`id` = NEW.`document_id`
      AND document.`workspace_id` = NEW.`workspace_id`
      AND document.`owner_user_id` = NEW.`owner_user_id`
      AND document.`status` <> 'Архив'
      AND document.`case_id` IS NEW.`from_case_id`
      AND document.`case_link_revision` + 1 = NEW.`mutation_version`
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
  SELECT RAISE(ABORT, 'document_case_link_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `documents_case_projection_guard`
BEFORE UPDATE OF `case_id`,`case_link_revision`,`case_linked_by_user_id`,`plan_step_id` ON `documents`
WHEN NOT EXISTS (
  SELECT 1 FROM `document_case_link_events` event
  WHERE event.`document_id` = NEW.`id`
    AND event.`workspace_id` = NEW.`workspace_id`
    AND event.`owner_user_id` = NEW.`owner_user_id`
    AND event.`actor_user_id` IS NEW.`case_linked_by_user_id`
    AND event.`from_case_id` IS OLD.`case_id`
    AND event.`to_case_id` IS NEW.`case_id`
    AND event.`mutation_version` = NEW.`case_link_revision`
    AND NEW.`case_link_revision` = OLD.`case_link_revision` + 1
    AND NEW.`plan_step_id` IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'documents_case_projection_guard');
END;--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_project`
AFTER INSERT ON `document_case_link_events`
BEGIN
  UPDATE `documents`
  SET `case_id` = NEW.`to_case_id`,
      `plan_step_id` = NULL,
      `case_link_revision` = NEW.`mutation_version`,
      `case_linked_by_user_id` = NEW.`actor_user_id`,
      `updated_at` = NEW.`created_at`
  WHERE `id` = NEW.`document_id`
    AND `workspace_id` = NEW.`workspace_id`
    AND `owner_user_id` = NEW.`owner_user_id`
    AND `case_id` IS NEW.`from_case_id`
    AND `case_link_revision` = NEW.`mutation_version` - 1;
END;--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_case_unlinked`
AFTER INSERT ON `document_case_link_events`
WHEN NEW.`from_case_id` IS NOT NULL
BEGIN
  INSERT INTO `case_events` (`id`,`case_id`,`actor_user_id`,`event_type`,`metadata_json`,`created_at`)
  VALUES (NEW.id || ':unlinked',NEW.from_case_id,NEW.actor_user_id,'document_unlinked',json_object('documentId',NEW.document_id,'mutationVersion',NEW.mutation_version),NEW.created_at);
END;--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_case_linked`
AFTER INSERT ON `document_case_link_events`
WHEN NEW.`to_case_id` IS NOT NULL
BEGIN
  INSERT INTO `case_events` (`id`,`case_id`,`actor_user_id`,`event_type`,`metadata_json`,`created_at`)
  VALUES (NEW.id || ':linked',NEW.to_case_id,NEW.actor_user_id,'document_linked',json_object('documentId',NEW.document_id,'mutationVersion',NEW.mutation_version),NEW.created_at);
END;--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_audit`
AFTER INSERT ON `document_case_link_events`
BEGIN
  INSERT INTO `workspace_audit_events` (`id`,`workspace_id`,`actor_user_id`,`entity_type`,`entity_id`,`action`,`metadata_json`,`created_at`)
  VALUES (NEW.id || ':audit',NEW.workspace_id,NEW.actor_user_id,'document',NEW.document_id,'document_case_link_changed',json_object('fromCaseId',NEW.from_case_id,'toCaseId',NEW.to_case_id,'mutationVersion',NEW.mutation_version),NEW.created_at);
END;--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_no_update`
BEFORE UPDATE ON `document_case_link_events`
BEGIN
  SELECT RAISE(ABORT, 'document_case_link_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `document_case_link_events_no_delete`
BEFORE DELETE ON `document_case_link_events`
WHEN EXISTS (SELECT 1 FROM `documents` WHERE `id` = OLD.`document_id`)
BEGIN
  SELECT RAISE(ABORT, 'document_case_link_event_immutable');
END;
