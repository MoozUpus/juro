CREATE TABLE `legal_custom_search_title_inventories` (
  `search_release_id` text PRIMARY KEY NOT NULL,
  `title_count` integer NOT NULL CHECK (`title_count`>0),
  `inventory_sha256` text NOT NULL CHECK (
    length(`inventory_sha256`)=64 AND `inventory_sha256` NOT GLOB '*[^0-9a-f]*'),
  `created_at` text NOT NULL,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_custom_search_trusted_titles` (
  `search_release_id` text NOT NULL,
  `title` text NOT NULL CHECK (length(trim(`title`))>0),
  PRIMARY KEY (`search_release_id`,`title`),
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_title_inventory_count_guard`
BEFORE INSERT ON `legal_custom_search_title_inventories`
WHEN NEW.`title_count`<>(SELECT count(*) FROM `legal_custom_search_trusted_titles`
  WHERE `search_release_id`=NEW.`search_release_id`)
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLE_COUNT_MISMATCH'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_title_inventory_insert_guard`
BEFORE INSERT ON `legal_custom_search_title_inventories`
WHEN EXISTS (SELECT 1 FROM `legal_custom_search_title_inventories`
  WHERE `search_release_id`=NEW.`search_release_id`)
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_trusted_titles_insert_guard`
BEFORE INSERT ON `legal_custom_search_trusted_titles`
WHEN EXISTS (SELECT 1 FROM `legal_custom_search_title_inventories`
  WHERE `search_release_id`=NEW.`search_release_id`)
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_title_inventories_no_update`
BEFORE UPDATE ON `legal_custom_search_title_inventories`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_title_inventories_no_delete`
BEFORE DELETE ON `legal_custom_search_title_inventories`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_trusted_titles_no_update`
BEFORE UPDATE ON `legal_custom_search_trusted_titles`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_trusted_titles_no_delete`
BEFORE DELETE ON `legal_custom_search_trusted_titles`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_TITLES_IMMUTABLE'); END;
