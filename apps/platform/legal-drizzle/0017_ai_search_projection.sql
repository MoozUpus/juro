CREATE TABLE `legal_ai_search_projection_builds` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `search_release_id` text NOT NULL,
  `projection_bucket_name` text NOT NULL,
  `source_release_sha256` text NOT NULL,
  `status` text NOT NULL,
  `cursor` text,
  `expected_item_count` integer NOT NULL,
  `copied_item_count` integer NOT NULL DEFAULT 0,
  `projection_sha256` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_ai_search_projection_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_ai_search_projection_status_check`
    CHECK (`status` IN ('building','complete','failed')),
  CONSTRAINT `legal_ai_search_projection_count_check`
    CHECK (`expected_item_count`>=0 AND `copied_item_count`>=0
      AND `copied_item_count`<=`expected_item_count`),
  CONSTRAINT `legal_ai_search_projection_source_hash_check`
    CHECK (length(`source_release_sha256`)=64
      AND `source_release_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_ai_search_projection_hash_check`
    CHECK (`projection_sha256` IS NULL OR (length(`projection_sha256`)=64
      AND `projection_sha256` NOT GLOB '*[^0-9a-f]*')),
  UNIQUE (`search_release_id`,`projection_bucket_name`)
);
--> statement-breakpoint
CREATE TABLE `legal_ai_search_projection_items` (
  `build_id` text NOT NULL,
  `search_release_id` text NOT NULL,
  `item_key` text NOT NULL,
  `canonical_chunk_id` text NOT NULL,
  `evidence_r2_key` text NOT NULL,
  `byte_count` integer NOT NULL,
  `sha256` text NOT NULL,
  `metadata_json` text NOT NULL,
  `copied_at` text NOT NULL,
  PRIMARY KEY (`build_id`,`item_key`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_ai_search_projection_builds`(`id`) ON DELETE restrict,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_ai_search_projection_item_size_check` CHECK (`byte_count`>0),
  CONSTRAINT `legal_ai_search_projection_item_hash_check`
    CHECK (length(`sha256`)=64 AND `sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `legal_ai_search_projection_release_item_idx`
ON `legal_ai_search_projection_items` (`search_release_id`,`item_key`);
--> statement-breakpoint
CREATE TRIGGER `legal_ai_search_projection_items_no_update`
BEFORE UPDATE ON `legal_ai_search_projection_items`
BEGIN SELECT RAISE(ABORT, 'LEGAL_AI_SEARCH_PROJECTION_ITEM_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_ai_search_projection_items_no_delete`
BEFORE DELETE ON `legal_ai_search_projection_items`
BEGIN SELECT RAISE(ABORT, 'LEGAL_AI_SEARCH_PROJECTION_ITEM_IMMUTABLE'); END;
