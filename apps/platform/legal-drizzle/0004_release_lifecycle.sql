CREATE TABLE `legal_corpus_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `corpus_hash` text NOT NULL,
  `member_count` integer NOT NULL,
  `status` text NOT NULL,
  `frozen_at` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_snapshot_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_snapshot_hash_check`
    CHECK (length(`corpus_hash`)=64 AND `corpus_hash` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_snapshot_count_check` CHECK (`member_count`>0),
  CONSTRAINT `legal_snapshot_status_check` CHECK (`status`='frozen')
);
--> statement-breakpoint
CREATE TABLE `legal_corpus_snapshot_members` (
  `corpus_snapshot_id` text NOT NULL,
  `provision_rendition_id` text NOT NULL,
  `locator_id` text NOT NULL,
  `sha256` text NOT NULL,
  PRIMARY KEY (`corpus_snapshot_id`,`provision_rendition_id`),
  FOREIGN KEY (`corpus_snapshot_id`) REFERENCES `legal_corpus_snapshots`(`id`) ON DELETE restrict,
  FOREIGN KEY (`provision_rendition_id`) REFERENCES `legal_provision_renditions`(`id`) ON DELETE restrict,
  FOREIGN KEY (`locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_search_releases` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `capability` text NOT NULL,
  `corpus_snapshot_id` text NOT NULL,
  `status` text NOT NULL,
  `item_count` integer NOT NULL,
  `retrieval_policy_version` text NOT NULL,
  `configuration_identity` text NOT NULL,
  `sealed_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`corpus_snapshot_id`) REFERENCES `legal_corpus_snapshots`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_search_release_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_search_release_capability_check`
    CHECK (`capability` IN ('current','history')),
  CONSTRAINT `legal_search_release_status_check`
    CHECK (`status` IN ('draft','sealed','failed')),
  CONSTRAINT `legal_search_release_count_check` CHECK (`item_count`>=0),
  CONSTRAINT `legal_search_release_seal_check`
    CHECK ((`status`='sealed' AND `sealed_at` IS NOT NULL)
      OR (`status`<>'sealed' AND `sealed_at` IS NULL))
);
--> statement-breakpoint
CREATE TABLE `legal_search_release_items` (
  `search_release_id` text NOT NULL,
  `provision_rendition_id` text NOT NULL,
  `canonical_chunk_id` text NOT NULL,
  `item_key` text NOT NULL,
  `r2_key` text NOT NULL,
  `byte_count` integer NOT NULL,
  `sha256` text NOT NULL,
  PRIMARY KEY (`search_release_id`,`item_key`),
  UNIQUE (`search_release_id`,`canonical_chunk_id`),
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`provision_rendition_id`) REFERENCES `legal_provision_renditions`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_activation_sets` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `current_release_id` text,
  `as_of_release_id` text,
  `comparison_current_release_id` text,
  `comparison_history_release_id` text,
  `previous_activation_set_id` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`current_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`as_of_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`comparison_current_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`comparison_history_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`previous_activation_set_id`) REFERENCES `legal_activation_sets`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_activation_set_environment_check`
    CHECK (`environment` IN ('development','staging','production'))
);
--> statement-breakpoint
CREATE TABLE `legal_active_activation_sets` (
  `environment` text PRIMARY KEY NOT NULL,
  `activation_set_id` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`activation_set_id`) REFERENCES `legal_activation_sets`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_activation_events` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `activation_set_id` text NOT NULL,
  `prior_activation_set_id` text,
  `action` text NOT NULL,
  `actor` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`activation_set_id`) REFERENCES `legal_activation_sets`(`id`) ON DELETE restrict,
  FOREIGN KEY (`prior_activation_set_id`) REFERENCES `legal_activation_sets`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_activation_event_action_check` CHECK (`action` IN ('activate','rollback')),
  CONSTRAINT `legal_activation_event_actor_check` CHECK (length(trim(`actor`)) BETWEEN 1 AND 160),
  CONSTRAINT `legal_activation_event_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE TRIGGER `legal_active_activation_set_guard`
BEFORE UPDATE ON `legal_active_activation_sets`
WHEN NOT EXISTS (
  SELECT 1 FROM `legal_activation_sets` candidate
  WHERE candidate.`id`=NEW.`activation_set_id`
    AND candidate.`environment`=OLD.`environment`
    AND candidate.`previous_activation_set_id`=OLD.`activation_set_id`
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_ACTIVATION_SET_STALE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_snapshots_no_update`
BEFORE UPDATE ON `legal_corpus_snapshots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_snapshot_members_no_update`
BEFORE UPDATE ON `legal_corpus_snapshot_members`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_snapshot_members_no_delete`
BEFORE DELETE ON `legal_corpus_snapshot_members`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_releases_identity_guard`
BEFORE UPDATE ON `legal_search_releases`
WHEN OLD.`status`<>'draft' OR NEW.`id`<>OLD.`id` OR NEW.`environment`<>OLD.`environment`
  OR NEW.`capability`<>OLD.`capability` OR NEW.`corpus_snapshot_id`<>OLD.`corpus_snapshot_id`
  OR NEW.`item_count`<>OLD.`item_count`
  OR NEW.`retrieval_policy_version`<>OLD.`retrieval_policy_version`
  OR NEW.`configuration_identity`<>OLD.`configuration_identity`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_RELEASE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_release_items_no_update`
BEFORE UPDATE ON `legal_search_release_items`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_RELEASE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_search_release_items_no_delete`
BEFORE DELETE ON `legal_search_release_items`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEARCH_RELEASE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_activation_sets_no_update`
BEFORE UPDATE ON `legal_activation_sets`
BEGIN SELECT RAISE(ABORT, 'LEGAL_ACTIVATION_SET_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_activation_events_no_update`
BEFORE UPDATE ON `legal_activation_events`
BEGIN SELECT RAISE(ABORT, 'LEGAL_ACTIVATION_EVENT_IMMUTABLE'); END;
