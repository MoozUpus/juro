-- Migration 0076: tenant-bound bookmarks for verified legal-source versions.
-- Expand-only. A bookmark is pinned to the publication version that was
-- current when the user saved it; later source activation never rewrites it.
CREATE TABLE `user_legal_bookmarks` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `source_id` text NOT NULL,
  `version_id` text NOT NULL,
  `case_id` text,
  `comment` text,
  `revision` integer DEFAULT 1 NOT NULL,
  `archived_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `user_legal_bookmarks_revision_check` CHECK (`revision` >= 1),
  CONSTRAINT `user_legal_bookmarks_comment_check` CHECK (`comment` IS NULL OR length(`comment`) <= 2000)
);--> statement-breakpoint
CREATE UNIQUE INDEX `user_legal_bookmarks_active_scope_uidx`
ON `user_legal_bookmarks` (`workspace_id`,`user_id`,`source_id`,`version_id`,coalesce(`case_id`,''))
WHERE `archived_at` IS NULL;--> statement-breakpoint
CREATE INDEX `user_legal_bookmarks_user_idx` ON `user_legal_bookmarks` (`workspace_id`,`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `user_legal_bookmarks_case_idx` ON `user_legal_bookmarks` (`workspace_id`,`case_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `user_legal_bookmarks_source_idx` ON `user_legal_bookmarks` (`source_id`,`version_id`);--> statement-breakpoint
CREATE TABLE `user_legal_bookmark_events` (
  `id` text PRIMARY KEY NOT NULL,
  `bookmark_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `source_id` text NOT NULL,
  `version_id` text NOT NULL,
  `case_id` text,
  `event_type` text NOT NULL,
  `revision` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `comment_sha256` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`bookmark_id`) REFERENCES `user_legal_bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `user_legal_bookmark_events_type_check` CHECK (`event_type` IN ('created','updated','archived')),
  CONSTRAINT `user_legal_bookmark_events_revision_check` CHECK (`revision` >= 1),
  CONSTRAINT `user_legal_bookmark_events_request_hash_check` CHECK (length(`request_hash`) = 64),
  CONSTRAINT `user_legal_bookmark_events_comment_hash_check` CHECK (`comment_sha256` IS NULL OR length(`comment_sha256`) = 64),
  CONSTRAINT `user_legal_bookmark_events_idempotency_check` CHECK (length(`idempotency_key`) BETWEEN 16 AND 180)
);--> statement-breakpoint
CREATE UNIQUE INDEX `user_legal_bookmark_events_revision_uidx` ON `user_legal_bookmark_events` (`bookmark_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_legal_bookmark_events_idempotency_uidx` ON `user_legal_bookmark_events` (`workspace_id`,`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `user_legal_bookmark_events_case_idx` ON `user_legal_bookmark_events` (`workspace_id`,`case_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `user_legal_bookmark_events_insert_guard`
BEFORE INSERT ON `user_legal_bookmark_events`
WHEN NEW.`actor_user_id` <> NEW.`user_id`
  OR NOT EXISTS (
    SELECT 1 FROM `user_legal_bookmarks` bookmark
    WHERE bookmark.`id` = NEW.`bookmark_id`
      AND bookmark.`workspace_id` = NEW.`workspace_id`
      AND bookmark.`user_id` = NEW.`user_id`
      AND bookmark.`source_id` = NEW.`source_id`
      AND bookmark.`version_id` = NEW.`version_id`
      AND bookmark.`case_id` IS NEW.`case_id`
      AND bookmark.`revision` = NEW.`revision`
      AND ((NEW.`event_type` = 'archived' AND bookmark.`archived_at` IS NOT NULL)
        OR (NEW.`event_type` <> 'archived' AND bookmark.`archived_at` IS NULL))
  )
BEGIN
  SELECT RAISE(ABORT, 'user_legal_bookmark_event_projection_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `user_legal_bookmark_events_audit`
AFTER INSERT ON `user_legal_bookmark_events`
BEGIN
  INSERT INTO `workspace_audit_events` (`id`,`workspace_id`,`actor_user_id`,`entity_type`,`entity_id`,`action`,`metadata_json`,`created_at`)
  VALUES (NEW.`id` || ':audit',NEW.`workspace_id`,NEW.`actor_user_id`,'legal_bookmark',NEW.`bookmark_id`,'legal_bookmark_' || NEW.`event_type`,json_object('sourceId',NEW.`source_id`,'versionId',NEW.`version_id`,'caseId',NEW.`case_id`,'revision',NEW.`revision`,'commentSha256',NEW.`comment_sha256`),NEW.`created_at`);
END;--> statement-breakpoint
CREATE TRIGGER `user_legal_bookmark_events_no_update`
BEFORE UPDATE ON `user_legal_bookmark_events`
BEGIN
  SELECT RAISE(ABORT, 'user_legal_bookmark_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `user_legal_bookmark_events_no_delete`
BEFORE DELETE ON `user_legal_bookmark_events`
WHEN EXISTS (SELECT 1 FROM `user_legal_bookmarks` WHERE `id` = OLD.`bookmark_id`)
BEGIN
  SELECT RAISE(ABORT, 'user_legal_bookmark_event_immutable');
END;
