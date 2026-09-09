-- Migration 0150 retained empty compatibility schemas for old recovery tools.
-- Ticket 22 proved those callers are retired. Refuse to remove the schemas if
-- any process repopulated them between migrations, then remove every remaining
-- D1 body, term, posting and Qdrant-era control surface.
CREATE TABLE `_legal_corpus_schema_removal_guard` (
  `id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `_legal_corpus_schema_removal_nonempty_guard`
BEFORE INSERT ON `_legal_corpus_schema_removal_guard`
WHEN EXISTS (SELECT 1 FROM `legal_corpus_provisions`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_chunks`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_sparse_terms`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_sparse_term_dictionary`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_sparse_chunk_keys`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_sparse_postings`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_search_index_builds`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_search_index_build_versions`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_search_index_manifests`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_search_index_versions`)
  OR EXISTS (SELECT 1 FROM `legal_corpus_search_index_activations`)
BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_RETIRED_SCHEMA_REPOPULATED'); END;
--> statement-breakpoint
INSERT INTO `_legal_corpus_schema_removal_guard` (`id`) VALUES (1);
--> statement-breakpoint
DROP TRIGGER `_legal_corpus_schema_removal_nonempty_guard`;
--> statement-breakpoint
DROP TABLE `_legal_corpus_schema_removal_guard`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_activations`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_versions`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_manifests`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_build_versions`;
--> statement-breakpoint
DROP TABLE `legal_corpus_search_index_builds`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_postings`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_terms`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_chunk_keys`;
--> statement-breakpoint
DROP TABLE `legal_corpus_sparse_term_dictionary`;
--> statement-breakpoint
DROP TABLE `legal_corpus_chunks`;
--> statement-breakpoint
DROP TABLE `legal_corpus_provisions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `legal_corpus_search`;
