CREATE TABLE `legal_custom_search_r2_runtime_roots` (
  `search_release_id` text PRIMARY KEY NOT NULL,
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
  CONSTRAINT `legal_custom_r2_runtime_schema_check`
    CHECK (`schema_version`='custom-search-r2-runtime-v1'),
  CONSTRAINT `legal_custom_r2_runtime_count_check`
    CHECK (`runtime_documents_size_bytes`>0 AND `mapping_count`>0),
  CONSTRAINT `legal_custom_r2_runtime_hash_check` CHECK (
    length(`sparse_manifest_sha256`)=64 AND `sparse_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`runtime_descriptor_sha256`)=64 AND `runtime_descriptor_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`runtime_documents_sha256`)=64 AND `runtime_documents_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`mapping_inventory_sha256`)=64 AND `mapping_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
  )
);
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_r2_runtime_roots_no_update`
BEFORE UPDATE ON `legal_custom_search_r2_runtime_roots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_R2_RUNTIME_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_r2_runtime_roots_no_delete`
BEFORE DELETE ON `legal_custom_search_r2_runtime_roots`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_R2_RUNTIME_IMMUTABLE'); END;
