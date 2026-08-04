-- Migration 0078: MFA-bound staff authoring evidence for the RU/UZ knowledge base.
-- Expand-only. Seeded 0077 rows remain valid; every new article/version and all
-- subsequent draft, publication, or lifecycle changes require an actor and
-- create append-only evidence at the D1 boundary.
ALTER TABLE `knowledge_base_articles` ADD COLUMN `created_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `knowledge_base_articles` ADD COLUMN `updated_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `knowledge_base_articles` ADD COLUMN `status_changed_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `knowledge_base_articles` ADD COLUMN `status_changed_at` text;--> statement-breakpoint
ALTER TABLE `knowledge_base_article_versions` ADD COLUMN `created_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `knowledge_base_article_versions` ADD COLUMN `updated_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `knowledge_base_article_versions` ADD COLUMN `published_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `knowledge_base_article_versions` ADD COLUMN `updated_at` text;--> statement-breakpoint
ALTER TABLE `knowledge_base_article_versions` ADD COLUMN `content_hash_version` text DEFAULT 'body-v1' NOT NULL;--> statement-breakpoint

CREATE TABLE `knowledge_base_authoring_events` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text NOT NULL,
  `version_id` text,
  `actor_user_id` text NOT NULL,
  `action` text NOT NULL,
  `previous_status` text,
  `new_status` text,
  `content_sha256` text,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `knowledge_base_articles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `knowledge_base_article_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `knowledge_base_authoring_events_action_check` CHECK (`action` IN ('article_created','article_updated','draft_created','draft_updated','published','status_changed')),
  CONSTRAINT `knowledge_base_authoring_events_status_check` CHECK ((`previous_status` IS NULL OR `previous_status` IN ('draft','published','archived')) AND (`new_status` IS NULL OR `new_status` IN ('draft','published','archived'))),
  CONSTRAINT `knowledge_base_authoring_events_hash_check` CHECK (`content_sha256` IS NULL OR length(`content_sha256`) = 64),
  CONSTRAINT `knowledge_base_authoring_events_metadata_check` CHECK (json_valid(`metadata_json`))
);--> statement-breakpoint
CREATE INDEX `knowledge_base_authoring_events_article_idx` ON `knowledge_base_authoring_events` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `knowledge_base_authoring_events_actor_idx` ON `knowledge_base_authoring_events` (`actor_user_id`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `knowledge_base_articles_new_actor_guard`
BEFORE INSERT ON `knowledge_base_articles`
WHEN NEW.`created_by_user_id` IS NULL OR NEW.`updated_by_user_id` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_article_actor_required');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_created_event`
AFTER INSERT ON `knowledge_base_articles`
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`id`,NULL,NEW.`created_by_user_id`,'article_created',NULL,NEW.`status`,NULL,json_object('slug',NEW.`slug`,'category',NEW.`category`),NEW.`created_at`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_identity_update_guard`
BEFORE UPDATE OF `slug`,`category` ON `knowledge_base_articles`
WHEN (OLD.`slug` <> NEW.`slug` OR OLD.`category` <> NEW.`category`) AND (
  NEW.`updated_by_user_id` IS NULL OR NEW.`updated_at` = OLD.`updated_at`
  OR EXISTS (SELECT 1 FROM `knowledge_base_article_versions` WHERE `article_id`=OLD.`id` AND `published_at` IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_article_identity_immutable_or_actor_missing');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_identity_updated_event`
AFTER UPDATE OF `slug`,`category` ON `knowledge_base_articles`
WHEN OLD.`slug` <> NEW.`slug` OR OLD.`category` <> NEW.`category`
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`id`,NULL,NEW.`updated_by_user_id`,'article_updated',NEW.`status`,NEW.`status`,NULL,json_object('previousSlug',OLD.`slug`,'slug',NEW.`slug`,'previousCategory',OLD.`category`,'category',NEW.`category`),NEW.`updated_at`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_status_guard`
BEFORE UPDATE OF `status` ON `knowledge_base_articles`
WHEN OLD.`status` <> NEW.`status` AND (
  NEW.`status_changed_by_user_id` IS NULL OR NEW.`status_changed_at` IS NULL
  OR NEW.`status_changed_at` IS OLD.`status_changed_at`
  OR (NEW.`status`='published' AND NOT EXISTS (SELECT 1 FROM `knowledge_base_article_versions` WHERE `article_id`=NEW.`id` AND `published_at` IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_article_status_evidence_required');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_articles_status_event`
AFTER UPDATE OF `status` ON `knowledge_base_articles`
WHEN OLD.`status` <> NEW.`status`
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`id`,NULL,NEW.`status_changed_by_user_id`,'status_changed',OLD.`status`,NEW.`status`,NULL,'{}',NEW.`status_changed_at`);
END;--> statement-breakpoint

CREATE TRIGGER `knowledge_base_versions_new_actor_guard`
BEFORE INSERT ON `knowledge_base_article_versions`
WHEN NEW.`created_by_user_id` IS NULL OR NEW.`updated_by_user_id` IS NULL OR NEW.`updated_at` IS NULL OR NEW.`content_hash_version` <> 'full-v2'
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_version_actor_required');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_created_event`
AFTER INSERT ON `knowledge_base_article_versions`
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`article_id`,NEW.`id`,NEW.`created_by_user_id`,'draft_created',NULL,'draft',NEW.`content_sha256`,json_object('versionNumber',NEW.`version_number`,'hashVersion',NEW.`content_hash_version`),NEW.`created_at`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_draft_update_guard`
BEFORE UPDATE OF `title_ru`,`title_uz`,`summary_ru`,`summary_uz`,`body_ru_json`,`body_uz_json`,`related_slugs_json`,`content_sha256`,`content_hash_version` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL AND (NEW.`updated_by_user_id` IS NULL OR NEW.`updated_at` IS NULL OR NEW.`updated_at` = OLD.`updated_at` OR NEW.`content_hash_version` <> 'full-v2')
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_draft_update_evidence_required');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_draft_updated_event`
AFTER UPDATE OF `title_ru`,`title_uz`,`summary_ru`,`summary_uz`,`body_ru_json`,`body_uz_json`,`related_slugs_json`,`content_sha256`,`content_hash_version` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`article_id`,NEW.`id`,NEW.`updated_by_user_id`,'draft_updated','draft','draft',NEW.`content_sha256`,json_object('versionNumber',NEW.`version_number`,'hashVersion',NEW.`content_hash_version`),NEW.`updated_at`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_publish_guard`
BEFORE UPDATE OF `published_at` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL AND NEW.`published_at` IS NOT NULL AND NEW.`published_by_user_id` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_publication_actor_required');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_published_event`
AFTER UPDATE OF `published_at` ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NULL AND NEW.`published_at` IS NOT NULL
BEGIN
  INSERT INTO `knowledge_base_authoring_events` (`id`,`article_id`,`version_id`,`actor_user_id`,`action`,`previous_status`,`new_status`,`content_sha256`,`metadata_json`,`created_at`)
  VALUES (lower(hex(randomblob(16))),NEW.`article_id`,NEW.`id`,NEW.`published_by_user_id`,'published','draft','published',NEW.`content_sha256`,json_object('versionNumber',NEW.`version_number`,'hashVersion',NEW.`content_hash_version`),NEW.`published_at`);
END;--> statement-breakpoint

CREATE TRIGGER `knowledge_base_articles_no_delete`
BEFORE DELETE ON `knowledge_base_articles`
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_article_delete_forbidden');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_versions_no_delete`
BEFORE DELETE ON `knowledge_base_article_versions`
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_version_delete_forbidden');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_authoring_events_no_update`
BEFORE UPDATE ON `knowledge_base_authoring_events`
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_authoring_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_authoring_events_no_delete`
BEFORE DELETE ON `knowledge_base_authoring_events`
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_authoring_event_immutable');
END;
