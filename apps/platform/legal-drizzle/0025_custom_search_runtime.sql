CREATE TABLE `legal_custom_search_runtime_components` (
  `search_release_id` text PRIMARY KEY NOT NULL,
  `complete_corpus_run_id` text NOT NULL,
  `schema_version` text NOT NULL,
  `sparse_manifest_sha256` text NOT NULL,
  `runtime_descriptor_r2_key` text NOT NULL,
  `runtime_descriptor_sha256` text NOT NULL,
  `runtime_documents_r2_key` text NOT NULL,
  `runtime_documents_sha256` text NOT NULL,
  `runtime_documents_size_bytes` integer NOT NULL,
  `mapping_count` integer NOT NULL,
  `mapping_inventory_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  FOREIGN KEY (`complete_corpus_run_id`) REFERENCES `legal_complete_corpus_runs`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_custom_runtime_schema_check`
    CHECK (`schema_version`='custom-search-runtime-v1'),
  CONSTRAINT `legal_custom_runtime_count_check`
    CHECK (`runtime_documents_size_bytes`>0 AND `mapping_count`>0),
  CONSTRAINT `legal_custom_runtime_hash_check` CHECK (
    length(`sparse_manifest_sha256`)=64 AND `sparse_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`runtime_descriptor_sha256`)=64 AND `runtime_descriptor_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`runtime_documents_sha256`)=64 AND `runtime_documents_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`mapping_inventory_sha256`)=64 AND `mapping_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
  )
);
--> statement-breakpoint
CREATE TABLE `legal_custom_search_runtime_items` (
  `search_release_id` text NOT NULL,
  `item_key` text NOT NULL,
  `retrieval_chunk_id` text NOT NULL,
  `item_ordinal` integer NOT NULL,
  `legal_identity_sha256` text NOT NULL,
  PRIMARY KEY (`search_release_id`,`item_key`),
  UNIQUE (`search_release_id`,`retrieval_chunk_id`),
  UNIQUE (`search_release_id`,`item_ordinal`),
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_custom_runtime_item_ordinal_check` CHECK (`item_ordinal`>=0),
  CONSTRAINT `legal_custom_runtime_item_identity_check`
    CHECK (length(`legal_identity_sha256`)=64 AND `legal_identity_sha256` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `legal_custom_search_runtime_items_identity_idx`
ON `legal_custom_search_runtime_items` (`search_release_id`,`legal_identity_sha256`);
--> statement-breakpoint
CREATE TABLE `legal_custom_query_budget_periods` (
  `environment` text NOT NULL,
  `period` text NOT NULL,
  `authorized_usd_micros` integer NOT NULL,
  `reserved_usd_micros` integer NOT NULL DEFAULT 0,
  `reserved_requests` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  PRIMARY KEY (`environment`,`period`),
  CONSTRAINT `legal_custom_query_budget_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_custom_query_budget_amount_check`
    CHECK (`authorized_usd_micros`>=0 AND `reserved_usd_micros`>=0
      AND `reserved_usd_micros`<=`authorized_usd_micros` AND `reserved_requests`>=0)
);
--> statement-breakpoint
CREATE TABLE `legal_custom_query_reservations` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `period` text NOT NULL,
  `release_id` text NOT NULL,
  `reserved_usd_micros` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`environment`,`period`)
    REFERENCES `legal_custom_query_budget_periods`(`environment`,`period`) ON DELETE restrict,
  CONSTRAINT `legal_custom_query_reservation_amount_check` CHECK (`reserved_usd_micros`>0)
);
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_runtime_components_no_update`
BEFORE UPDATE ON `legal_custom_search_runtime_components`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_RUNTIME_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_runtime_components_no_delete`
BEFORE DELETE ON `legal_custom_search_runtime_components`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_RUNTIME_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_runtime_items_no_update`
BEFORE UPDATE ON `legal_custom_search_runtime_items`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_RUNTIME_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_runtime_items_no_delete`
BEFORE DELETE ON `legal_custom_search_runtime_items`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_RUNTIME_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_query_reservations_no_update`
BEFORE UPDATE ON `legal_custom_query_reservations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_QUERY_RESERVATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_query_reservations_no_delete`
BEFORE DELETE ON `legal_custom_query_reservations`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_QUERY_RESERVATION_IMMUTABLE'); END;
