-- The original exportable sparse index repeats long document, version and
-- chunk identifiers for every term posting. Keep it readable during the
-- online transition, but write future postings through compact dictionaries
-- so the bounded Lex catalogue can fit within the staging D1 capacity gate.
-- No legal source text is changed or copied by this migration.
CREATE TABLE `legal_corpus_sparse_term_dictionary` (
  `id` integer PRIMARY KEY NOT NULL,
  `term` text NOT NULL,
  CONSTRAINT `legal_corpus_sparse_dictionary_term_check` CHECK (length(`term`) BETWEEN 1 AND 81),
  UNIQUE (`term`)
);
--> statement-breakpoint
CREATE TABLE `legal_corpus_sparse_chunk_keys` (
  `id` integer PRIMARY KEY NOT NULL,
  `chunk_id` text NOT NULL,
  FOREIGN KEY (`chunk_id`) REFERENCES `legal_corpus_chunks`(`id`) ON UPDATE no action ON DELETE restrict,
  UNIQUE (`chunk_id`)
);
--> statement-breakpoint
CREATE TABLE `legal_corpus_sparse_postings` (
  `term_id` integer NOT NULL,
  `chunk_key_id` integer NOT NULL,
  `term_frequency` integer NOT NULL,
  `title_frequency` integer NOT NULL DEFAULT 0,
  `article_frequency` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`term_id`,`chunk_key_id`),
  FOREIGN KEY (`term_id`) REFERENCES `legal_corpus_sparse_term_dictionary`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`chunk_key_id`) REFERENCES `legal_corpus_sparse_chunk_keys`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_compressed_sparse_frequency_check`
    CHECK (`term_frequency`>=0 AND `title_frequency`>=0 AND `article_frequency`>=0),
  CONSTRAINT `legal_corpus_compressed_sparse_nonempty_check`
    CHECK (`term_frequency`+`title_frequency`+`article_frequency`>0)
);
--> statement-breakpoint
CREATE INDEX `legal_corpus_sparse_postings_chunk_key_idx`
  ON `legal_corpus_sparse_postings` (`chunk_key_id`);
