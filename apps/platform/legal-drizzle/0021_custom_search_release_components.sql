CREATE TABLE `legal_custom_search_release_components` (
  `search_release_id` text PRIMARY KEY NOT NULL,
  `schema_version` text NOT NULL,
  `source_root_sha256` text NOT NULL,
  `chunk_policy_version` text NOT NULL,
  `chunk_inventory_r2_key` text NOT NULL,
  `chunk_inventory_sha256` text NOT NULL,
  `chunk_count` integer NOT NULL,
  `sparse_analyzer` text NOT NULL,
  `sparse_partition_count` integer NOT NULL,
  `sparse_manifest_r2_key` text NOT NULL,
  `sparse_manifest_sha256` text NOT NULL,
  `embedding_input_version` text NOT NULL,
  `embedding_model` text NOT NULL,
  `embedding_dimensions` integer NOT NULL,
  `embedding_transform_version` text NOT NULL,
  `embedding_inventory_r2_key` text NOT NULL,
  `embedding_inventory_sha256` text NOT NULL,
  `vectorize_index_name` text NOT NULL,
  `vectorize_final_mutation_id` text NOT NULL,
  `vectorize_inventory_r2_key` text NOT NULL,
  `vectorize_inventory_sha256` text NOT NULL,
  `vector_count` integer NOT NULL,
  `metadata_indexes_json` text NOT NULL,
  `metadata_indexes_sha256` text NOT NULL,
  `fusion_policy_version` text NOT NULL,
  `provider_input_tokens` integer NOT NULL,
  `provider_cost_usd_micros` integer NOT NULL,
  `configuration_sha256` text NOT NULL,
  `privacy_attestation_sha256` text NOT NULL,
  `restore_preflight_sha256` text NOT NULL,
  `sealed_at` text NOT NULL,
  FOREIGN KEY (`search_release_id`) REFERENCES `legal_search_releases`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_custom_component_schema_check`
    CHECK (`schema_version`='custom-search-release-v1'),
  CONSTRAINT `legal_custom_component_policy_check`
    CHECK (`chunk_policy_version`='retrieval-chunk-v1'
      AND `sparse_analyzer`='word-v1'
      AND `sparse_partition_count`=16
      AND `embedding_input_version`='legal-embedding-input-v1'
      AND `embedding_model`='text-embedding-3-large'
      AND `embedding_dimensions`=1536
      AND `embedding_transform_version`='float32-l2-v1'
      AND `fusion_policy_version`='equal-rrf-k60-v1'),
  CONSTRAINT `legal_custom_component_count_check`
    CHECK (`chunk_count`>0 AND `vector_count`=`chunk_count`
      AND `provider_input_tokens`>=0 AND `provider_cost_usd_micros`>=0),
  CONSTRAINT `legal_custom_component_hash_check`
    CHECK (length(`source_root_sha256`)=64 AND `source_root_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`chunk_inventory_sha256`)=64 AND `chunk_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`sparse_manifest_sha256`)=64 AND `sparse_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`embedding_inventory_sha256`)=64 AND `embedding_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`vectorize_inventory_sha256`)=64 AND `vectorize_inventory_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`metadata_indexes_sha256`)=64 AND `metadata_indexes_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`configuration_sha256`)=64 AND `configuration_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`privacy_attestation_sha256`)=64 AND `privacy_attestation_sha256` NOT GLOB '*[^0-9a-f]*'
      AND length(`restore_preflight_sha256`)=64 AND `restore_preflight_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_custom_component_r2_key_check`
    CHECK (length(trim(`chunk_inventory_r2_key`))>0
      AND length(trim(`sparse_manifest_r2_key`))>0
      AND length(trim(`embedding_inventory_r2_key`))>0
      AND length(trim(`vectorize_inventory_r2_key`))>0),
  CONSTRAINT `legal_custom_component_vectorize_check`
    CHECK (length(trim(`vectorize_index_name`))>0
      AND length(trim(`vectorize_final_mutation_id`))>0),
  CONSTRAINT `legal_custom_component_metadata_check`
    CHECK (json_valid(`metadata_indexes_json`)
      AND `metadata_indexes_json`='["document_type","language","valid_from_epoch","valid_to_epoch"]')
);
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_release_components_no_update`
BEFORE UPDATE ON `legal_custom_search_release_components`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_RELEASE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_custom_search_release_components_no_delete`
BEFORE DELETE ON `legal_custom_search_release_components`
BEGIN SELECT RAISE(ABORT, 'LEGAL_CUSTOM_SEARCH_RELEASE_IMMUTABLE'); END;
