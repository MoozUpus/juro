CREATE TABLE `legal_evidence_locators` (
  `id` text PRIMARY KEY NOT NULL,
  `object_kind` text NOT NULL,
  `r2_key` text NOT NULL UNIQUE,
  `media_type` text NOT NULL,
  `byte_count` integer NOT NULL,
  `sha256` text NOT NULL,
  `source_normalized_sha256` text,
  `ordinal` integer NOT NULL,
  `schema_version` integer NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_evidence_locator_kind_check`
    CHECK (`object_kind` IN ('raw_capture','normalized_revision','provision_rendition')),
  CONSTRAINT `legal_evidence_locator_size_check` CHECK (`byte_count`>0),
  CONSTRAINT `legal_evidence_locator_sha_check`
    CHECK (length(`sha256`)=64 AND `sha256` NOT GLOB '*[^0-9a-f]*'
      AND (`source_normalized_sha256` IS NULL OR
        (length(`source_normalized_sha256`)=64
          AND `source_normalized_sha256` NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT `legal_evidence_locator_schema_check` CHECK (`schema_version`=1)
);
--> statement-breakpoint
CREATE TABLE `legal_instruments` (
  `id` text PRIMARY KEY NOT NULL,
  `publisher_instrument_token` text NOT NULL UNIQUE,
  `canonical_title` text NOT NULL,
  `document_type` text NOT NULL,
  `canonical_url` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legal_official_expressions` (
  `id` text PRIMARY KEY NOT NULL,
  `legal_instrument_id` text NOT NULL,
  `language_tag` text NOT NULL,
  `source_url` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`legal_instrument_id`) REFERENCES `legal_instruments`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legal_text_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `official_expression_id` text NOT NULL,
  `publisher_revision_token` text NOT NULL,
  `raw_locator_id` text NOT NULL,
  `normalized_locator_id` text NOT NULL,
  `captured_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`official_expression_id`) REFERENCES `legal_official_expressions`(`id`) ON DELETE restrict,
  FOREIGN KEY (`raw_locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict,
  FOREIGN KEY (`normalized_locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict,
  UNIQUE (`official_expression_id`,`publisher_revision_token`)
);
--> statement-breakpoint
CREATE TABLE `legal_provision_concepts` (
  `id` text PRIMARY KEY NOT NULL,
  `legal_instrument_id` text NOT NULL,
  `publisher_concept_token` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`legal_instrument_id`) REFERENCES `legal_instruments`(`id`) ON DELETE restrict,
  UNIQUE (`legal_instrument_id`,`publisher_concept_token`)
);
--> statement-breakpoint
CREATE TABLE `legal_provision_renditions` (
  `id` text PRIMARY KEY NOT NULL,
  `provision_concept_id` text NOT NULL,
  `text_revision_id` text NOT NULL,
  `locator_id` text NOT NULL UNIQUE,
  `article_number` text NOT NULL,
  `article_title` text,
  `sequence` integer NOT NULL,
  `source_url` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`provision_concept_id`) REFERENCES `legal_provision_concepts`(`id`) ON DELETE restrict,
  FOREIGN KEY (`text_revision_id`) REFERENCES `legal_text_revisions`(`id`) ON DELETE restrict,
  FOREIGN KEY (`locator_id`) REFERENCES `legal_evidence_locators`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_provision_rendition_status_check`
    CHECK (`status` IN ('active','historical','repealed','unknown')),
  CONSTRAINT `legal_provision_rendition_sequence_check` CHECK (`sequence`>=0),
  UNIQUE (`provision_concept_id`,`text_revision_id`)
);
--> statement-breakpoint
CREATE TABLE `legal_official_eligibility` (
  `id` text PRIMARY KEY NOT NULL,
  `subject_type` text NOT NULL,
  `subject_id` text NOT NULL,
  `capability` text NOT NULL,
  `status` text NOT NULL,
  `reason_codes_json` text NOT NULL,
  `evaluated_at` text NOT NULL,
  CONSTRAINT `legal_official_eligibility_subject_check`
    CHECK (`subject_type` IN ('text_revision','provision_rendition')),
  CONSTRAINT `legal_official_eligibility_capability_check`
    CHECK (`capability` IN ('current','as_of','comparison')),
  CONSTRAINT `legal_official_eligibility_status_check`
    CHECK (`status` IN ('eligible','ineligible','gap'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_official_eligibility_subject_uidx`
ON `legal_official_eligibility` (`subject_type`,`subject_id`,`capability`);
--> statement-breakpoint
CREATE TRIGGER `legal_evidence_locators_no_update`
BEFORE UPDATE ON `legal_evidence_locators`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVIDENCE_LOCATOR_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_evidence_locators_no_delete`
BEFORE DELETE ON `legal_evidence_locators`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EVIDENCE_LOCATOR_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_instruments_no_update`
BEFORE UPDATE ON `legal_instruments`
BEGIN SELECT RAISE(ABORT, 'LEGAL_INSTRUMENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_official_expressions_no_update`
BEFORE UPDATE ON `legal_official_expressions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_OFFICIAL_EXPRESSION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_text_revisions_no_update`
BEFORE UPDATE ON `legal_text_revisions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TEXT_REVISION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_provision_concepts_no_update`
BEFORE UPDATE ON `legal_provision_concepts`
BEGIN SELECT RAISE(ABORT, 'LEGAL_PROVISION_CONCEPT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_provision_renditions_no_update`
BEFORE UPDATE ON `legal_provision_renditions`
BEGIN SELECT RAISE(ABORT, 'LEGAL_PROVISION_RENDITION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_official_eligibility_no_update`
BEFORE UPDATE ON `legal_official_eligibility`
BEGIN SELECT RAISE(ABORT, 'LEGAL_OFFICIAL_ELIGIBILITY_IMMUTABLE'); END;
