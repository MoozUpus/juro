-- Each official language variant keeps its own exact source title. The
-- canonical document title remains as a backwards-compatible registry label;
-- retrieval uses the language-specific value when available.
ALTER TABLE `legal_corpus_variants` ADD COLUMN `title` text;
--> statement-breakpoint
ALTER TABLE `legal_corpus_variants` ADD COLUMN `short_title` text;
--> statement-breakpoint
UPDATE `legal_corpus_variants`
SET `title`=(SELECT `title` FROM `legal_corpus_documents` WHERE `id`=`legal_corpus_variants`.`document_id`),
    `short_title`=(SELECT `short_title` FROM `legal_corpus_documents` WHERE `id`=`legal_corpus_variants`.`document_id`)
WHERE `title` IS NULL;
