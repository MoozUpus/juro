ALTER TABLE `legal_official_expressions`
ADD COLUMN `script` text NOT NULL DEFAULT 'unknown'
  CHECK (`script` IN ('Latn','Cyrl','unknown'));
--> statement-breakpoint
ALTER TABLE `legal_official_expressions`
ADD COLUMN `textual_authority` text NOT NULL DEFAULT 'unknown'
  CHECK (`textual_authority` IN ('controlling','official_translation','unknown'));
--> statement-breakpoint
ALTER TABLE `legal_official_expressions`
ADD COLUMN `origin` text NOT NULL DEFAULT 'unknown'
  CHECK (`origin` IN ('certified_original','adopted_original','official_publisher','unknown'));
--> statement-breakpoint
ALTER TABLE `legal_official_expressions`
ADD COLUMN `publication_status` text NOT NULL DEFAULT 'unknown'
  CHECK (`publication_status` IN ('official','withdrawn','unknown'));
--> statement-breakpoint
ALTER TABLE `legal_official_expressions`
ADD COLUMN `controlling_on_conflict` integer NOT NULL DEFAULT 0
  CHECK (`controlling_on_conflict` IN (0,1));
--> statement-breakpoint
ALTER TABLE `legal_official_expressions`
ADD COLUMN `derived_from_expression_id` text;
--> statement-breakpoint
ALTER TABLE `legal_official_expressions`
ADD COLUMN `authority_evidence_json` text;
--> statement-breakpoint
ALTER TABLE `legal_text_revisions`
ADD COLUMN `script` text NOT NULL DEFAULT 'unknown'
  CHECK (`script` IN ('Latn','Cyrl','unknown'));
--> statement-breakpoint
ALTER TABLE `legal_text_revisions`
ADD COLUMN `textual_authority` text NOT NULL DEFAULT 'unknown'
  CHECK (`textual_authority` IN ('controlling','official_translation','unknown'));
--> statement-breakpoint
ALTER TABLE `legal_text_revisions`
ADD COLUMN `authority_evidence_json` text;
--> statement-breakpoint
CREATE INDEX `legal_text_revision_authority_idx`
ON `legal_text_revisions` (`textual_authority`,`official_expression_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_official_expression_natural_uidx`
ON `legal_official_expressions`
  (`legal_instrument_id`,`language_tag`,`script`,`textual_authority`);
