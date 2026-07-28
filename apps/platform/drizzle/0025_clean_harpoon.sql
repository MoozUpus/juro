CREATE TABLE `legal_review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`version_id` text,
	`reason_code` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`assigned_to_user_id` text,
	`decision` text,
	`decided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `legal_review_queue_status_idx` ON `legal_review_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `legal_review_queue_source_idx` ON `legal_review_queue` (`source_id`,`version_id`);--> statement-breakpoint
CREATE TABLE `legal_source_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`section_id` text,
	`chunk_index` integer NOT NULL,
	`language` text NOT NULL,
	`content_text` text NOT NULL,
	`content_sha256` text NOT NULL,
	`vector_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`indexed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `legal_source_sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_chunks_order_uidx` ON `legal_source_chunks` (`version_id`,`chunk_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_chunks_vector_uidx` ON `legal_source_chunks` (`vector_id`);--> statement-breakpoint
CREATE INDEX `legal_source_chunks_section_idx` ON `legal_source_chunks` (`section_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `legal_source_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`canonical_ref` text,
	`article` text,
	`part` text,
	`clause` text,
	`heading` text,
	`body_text` text NOT NULL,
	`sequence` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_sections_ref_uidx` ON `legal_source_sections` (`version_id`,`canonical_ref`);--> statement-breakpoint
CREATE INDEX `legal_source_sections_order_idx` ON `legal_source_sections` (`version_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `legal_source_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_version_id` text,
	`language` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`content_sha256` text NOT NULL,
	`raw_object_key` text NOT NULL,
	`parsed_object_key` text,
	`published_at` text,
	`effective_at` text,
	`expires_at` text,
	`fetched_at` text NOT NULL,
	`verified_at` text,
	`verified_by_user_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_versions_hash_uidx` ON `legal_source_versions` (`source_id`,`language`,`content_sha256`);--> statement-breakpoint
CREATE INDEX `legal_source_versions_status_idx` ON `legal_source_versions` (`source_id`,`status`,`effective_at`);--> statement-breakpoint
CREATE TABLE `source_sync_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source_url` text,
	`external_id` text,
	`error_code` text NOT NULL,
	`retryable` integer DEFAULT false NOT NULL,
	`safe_summary` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `source_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_sync_errors_run_idx` ON `source_sync_errors` (`run_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `source_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`source_kind` text NOT NULL,
	`run_type` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`lock_key` text NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`fetched_count` integer DEFAULT 0 NOT NULL,
	`changed_count` integer DEFAULT 0 NOT NULL,
	`verified_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`error_summary` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_sync_runs_status_idx` ON `source_sync_runs` (`source_kind`,`status`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_sync_runs_lock_uidx` ON `source_sync_runs` (`lock_key`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_sync_runs_active_lock_uidx` ON `source_sync_runs` (`lock_key`) WHERE `status` = 'running';--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `canonical_id` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `verification_state` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `content_sha256` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `fetched_at` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `verified_at` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `verified_by_user_id` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `verification_notes` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `effective_at` text;--> statement-breakpoint
ALTER TABLE `legal_sources` ADD `expires_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `legal_sources_canonical_locale_uidx` ON `legal_sources` (`canonical_id`,`locale`);--> statement-breakpoint
CREATE INDEX `legal_sources_verification_idx` ON `legal_sources` (`verification_state`,`locale`,`last_checked_at`);--> statement-breakpoint
CREATE TRIGGER `legal_sources_verification_insert_guard`
BEFORE INSERT ON `legal_sources`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source verification state invalid')
  WHERE NEW.`verification_state` NOT IN ('draft','fetched','pending_review','verified','rejected','archived','unavailable');
  SELECT RAISE(ABORT, 'legal source type invalid')
  WHERE NEW.`source_type` NOT IN ('lex','advice','internal');
  SELECT RAISE(ABORT, 'verified legal source requires exact evidence')
  WHERE NEW.`verification_state` = 'verified' AND (
      NEW.`verified_at` IS NULL OR NEW.`verified_by_user_id` IS NULL OR
      NEW.`content_sha256` IS NULL OR length(NEW.`content_sha256`) <> 64 OR
      NEW.`content_sha256` GLOB '*[^0-9a-f]*' OR
      NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id` = NEW.`verified_by_user_id`)
    );
END;--> statement-breakpoint
CREATE TRIGGER `legal_sources_verification_update_guard`
BEFORE UPDATE OF `verification_state`,`source_type`,`content_sha256`,`verified_at`,`verified_by_user_id` ON `legal_sources`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source verification state invalid')
  WHERE NEW.`verification_state` NOT IN ('draft','fetched','pending_review','verified','rejected','archived','unavailable');
  SELECT RAISE(ABORT, 'legal source type invalid')
  WHERE NEW.`source_type` NOT IN ('lex','advice','internal');
  SELECT RAISE(ABORT, 'verified legal source requires exact evidence')
  WHERE NEW.`verification_state` = 'verified' AND (
      NEW.`verified_at` IS NULL OR NEW.`verified_by_user_id` IS NULL OR
      NEW.`content_sha256` IS NULL OR length(NEW.`content_sha256`) <> 64 OR
      NEW.`content_sha256` GLOB '*[^0-9a-f]*' OR
      NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id` = NEW.`verified_by_user_id`)
    );
  SELECT RAISE(ABORT, 'verified legal source evidence is immutable')
  WHERE OLD.`verification_state` = 'verified' AND NEW.`verification_state` = 'verified' AND (
      NEW.`content_sha256` <> OLD.`content_sha256` OR
      NEW.`verified_at` <> OLD.`verified_at` OR
      NEW.`verified_by_user_id` <> OLD.`verified_by_user_id`
    );
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_versions_insert_guard`
BEFORE INSERT ON `legal_source_versions`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source version status invalid')
  WHERE NEW.`status` NOT IN ('pending_review','verified','rejected','archived','unavailable');
  SELECT RAISE(ABORT, 'legal source version hash invalid')
  WHERE length(NEW.`content_sha256`) <> 64 OR NEW.`content_sha256` GLOB '*[^0-9a-f]*';
  SELECT RAISE(ABORT, 'verified legal source version requires evidence')
  WHERE NEW.`status` = 'verified' AND (NEW.`verified_at` IS NULL OR NEW.`verified_by_user_id` IS NULL);
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_versions_update_guard`
BEFORE UPDATE OF `status`,`content_sha256`,`verified_at`,`verified_by_user_id` ON `legal_source_versions`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source version status invalid')
  WHERE NEW.`status` NOT IN ('pending_review','verified','rejected','archived','unavailable');
  SELECT RAISE(ABORT, 'legal source version hash invalid')
  WHERE length(NEW.`content_sha256`) <> 64 OR NEW.`content_sha256` GLOB '*[^0-9a-f]*';
  SELECT RAISE(ABORT, 'verified legal source version requires evidence')
  WHERE NEW.`status` = 'verified' AND (NEW.`verified_at` IS NULL OR NEW.`verified_by_user_id` IS NULL);
  SELECT RAISE(ABORT, 'verified legal source version evidence is immutable')
  WHERE OLD.`status` = 'verified' AND NEW.`status` = 'verified' AND (
      NEW.`content_sha256` <> OLD.`content_sha256` OR
      NEW.`verified_at` <> OLD.`verified_at` OR
      NEW.`verified_by_user_id` <> OLD.`verified_by_user_id`
    );
END;--> statement-breakpoint
CREATE TRIGGER `source_sync_runs_insert_guard`
BEFORE INSERT ON `source_sync_runs`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'source sync scope invalid')
  WHERE NEW.`source_kind` NOT IN ('lex','advice') OR NEW.`environment` NOT IN ('development','staging','production');
  SELECT RAISE(ABORT, 'source sync status invalid')
  WHERE NEW.`status` NOT IN ('running','success','partial','failed','cancelled');
  SELECT RAISE(ABORT, 'source sync completion evidence invalid')
  WHERE (NEW.`status` = 'running' AND NEW.`finished_at` IS NOT NULL) OR
        (NEW.`status` <> 'running' AND NEW.`finished_at` IS NULL);
END;--> statement-breakpoint
CREATE TRIGGER `source_sync_runs_update_guard`
BEFORE UPDATE OF `status`,`finished_at`,`discovered_count`,`fetched_count`,`changed_count`,`verified_count`,`error_count` ON `source_sync_runs`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'source sync status invalid')
  WHERE NEW.`status` NOT IN ('running','success','partial','failed','cancelled');
  SELECT RAISE(ABORT, 'source sync completion evidence invalid')
  WHERE (NEW.`status` = 'running' AND NEW.`finished_at` IS NOT NULL) OR
        (NEW.`status` <> 'running' AND NEW.`finished_at` IS NULL);
  SELECT RAISE(ABORT, 'source sync counters invalid')
  WHERE NEW.`discovered_count` < 0 OR NEW.`fetched_count` < 0 OR
        NEW.`changed_count` < 0 OR NEW.`verified_count` < 0 OR NEW.`error_count` < 0;
END;--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_insert_guard`
BEFORE INSERT ON `legal_review_queue`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal review state invalid')
  WHERE NEW.`confidence` NOT IN ('high','medium','low') OR
        NEW.`status` NOT IN ('pending','in_review','approved','rejected','closed');
  SELECT RAISE(ABORT, 'legal review decision evidence required')
  WHERE NEW.`status` IN ('approved','rejected') AND (NEW.`decision` IS NULL OR NEW.`decided_at` IS NULL);
END;--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_update_guard`
BEFORE UPDATE OF `confidence`,`status`,`decision`,`decided_at` ON `legal_review_queue`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal review state invalid')
  WHERE NEW.`confidence` NOT IN ('high','medium','low') OR
        NEW.`status` NOT IN ('pending','in_review','approved','rejected','closed');
  SELECT RAISE(ABORT, 'legal review decision evidence required')
  WHERE NEW.`status` IN ('approved','rejected') AND (NEW.`decision` IS NULL OR NEW.`decided_at` IS NULL);
END;
