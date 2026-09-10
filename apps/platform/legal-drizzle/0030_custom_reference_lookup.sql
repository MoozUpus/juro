CREATE TABLE `legal_custom_search_reference_lookups` (
  `search_release_id` text PRIMARY KEY NOT NULL,
  `source_inventory_sha256` text NOT NULL,
  `lookup_r2_key` text NOT NULL,
  `lookup_sha256` text NOT NULL,
  `lookup_size_bytes` integer NOT NULL CHECK (`lookup_size_bytes` > 0 AND `lookup_size_bytes` <= 262144),
  `member_count` integer NOT NULL CHECK (`member_count` > 0),
  `indexed_member_count` integer NOT NULL CHECK (`indexed_member_count` >= 0 AND `indexed_member_count` <= `member_count`),
  `created_at` text NOT NULL,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CHECK (length(`source_inventory_sha256`)=64 AND `source_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`lookup_sha256`)=64 AND `lookup_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_reference_lookups_no_update`
BEFORE UPDATE ON `legal_custom_search_reference_lookups`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_REFERENCE_LOOKUP_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_reference_lookups_no_delete`
BEFORE DELETE ON `legal_custom_search_reference_lookups`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_REFERENCE_LOOKUP_IMMUTABLE'); END;
