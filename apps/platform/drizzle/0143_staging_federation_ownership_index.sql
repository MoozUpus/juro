-- Staging-only logical ownership projection for the five-source federation.
-- It stores identifiers and provenance metadata only; source corpus rows,
-- versions, chunks and the immutable failure ledger remain in their original
-- databases. Production wrangler migrations intentionally exclude 0143.
CREATE TABLE `legal_corpus_federation_ownership` (
  `canonical_document_id` text PRIMARY KEY NOT NULL,
  `partition_name` text NOT NULL,
  `source_database_name` text NOT NULL,
  `source_database_id` text NOT NULL,
  `source_occurrence_count` integer NOT NULL,
  `source_class` text NOT NULL,
  `canonical_url` text,
  `document_type` text,
  `document_number` text,
  `source_updated_at` text,
  `assigned_at` text NOT NULL,
  `assignment_rule` text NOT NULL,
  CONSTRAINT `legal_corpus_federation_partition_check` CHECK (
    `partition_name` GLOB 'juro-staging-corpus-shard-[1-9]*'
  ),
  CONSTRAINT `legal_corpus_federation_source_check` CHECK (
    `source_database_name` IN (
      'juro-staging',
      'juro-staging-corpus-v2',
      'juro-staging-corpus-shard-1',
      'juro-staging-corpus-shard-2',
      'juro-staging-corpus-shard-3'
    )
  ),
  CONSTRAINT `legal_corpus_federation_occurrence_check` CHECK (`source_occurrence_count`>=1),
  CONSTRAINT `legal_corpus_federation_assignment_rule_check` CHECK (
    `assignment_rule`='sha256(canonical_document_id) modulo 4; representative=official/newest'
  )
);
CREATE INDEX `legal_corpus_federation_ownership_partition_idx`
  ON `legal_corpus_federation_ownership` (`partition_name`,`canonical_document_id`);
CREATE INDEX `legal_corpus_federation_ownership_source_idx`
  ON `legal_corpus_federation_ownership` (`source_database_name`,`canonical_document_id`);

CREATE TABLE `legal_corpus_federation_ownership_runs` (
  `run_id` text PRIMARY KEY NOT NULL,
  `captured_at` text NOT NULL,
  `source_set_sha256` text NOT NULL,
  `partition_manifest_sha256` text NOT NULL,
  `raw_document_rows` integer NOT NULL,
  `unique_canonical_document_ids` integer NOT NULL,
  `duplicate_document_rows` integer NOT NULL,
  `partition_count` integer NOT NULL,
  `status` text NOT NULL,
  CONSTRAINT `legal_corpus_federation_run_hash_check` CHECK (
    length(`source_set_sha256`)=64 AND `source_set_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`partition_manifest_sha256`)=64
    AND `partition_manifest_sha256` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `legal_corpus_federation_run_count_check` CHECK (
    `raw_document_rows`>=0 AND `unique_canonical_document_ids`>=0
    AND `duplicate_document_rows`>=0 AND `partition_count`>=1
  ),
  CONSTRAINT `legal_corpus_federation_run_status_check` CHECK (`status` IN ('built','verified'))
);
