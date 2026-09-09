CREATE TABLE `legal_text_revision_validity` (
  `text_revision_id` text PRIMARY KEY NOT NULL,
  `valid_from` text NOT NULL,
  `valid_to` text,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`text_revision_id`) REFERENCES `legal_text_revisions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_text_revision_validity_interval_check`
    CHECK (`valid_to` IS NULL OR `valid_from`<`valid_to`)
);
--> statement-breakpoint
CREATE TABLE `legal_applicability_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `provision_rendition_id` text NOT NULL,
  `valid_from` text NOT NULL,
  `valid_to` text,
  `evidence_url` text NOT NULL,
  `evidence_kind` text NOT NULL,
  `status` text NOT NULL DEFAULT 'verified',
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`provision_rendition_id`) REFERENCES `legal_provision_renditions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_applicability_period_interval_check`
    CHECK (`valid_to` IS NULL OR `valid_from`<`valid_to`),
  CONSTRAINT `legal_applicability_period_status_check` CHECK (`status`='verified'),
  CONSTRAINT `legal_applicability_period_evidence_kind_check`
    CHECK (`evidence_kind` IN ('commencement_clause','amendment_act','repeal_act','official_timeline')),
  UNIQUE (`provision_rendition_id`,`valid_from`,`valid_to`)
);
--> statement-breakpoint
CREATE INDEX `legal_applicability_period_lookup_idx`
ON `legal_applicability_periods` (`provision_rendition_id`,`valid_from`,`valid_to`);
--> statement-breakpoint
CREATE TABLE `legal_temporal_coverage_gaps` (
  `id` text PRIMARY KEY NOT NULL,
  `provision_rendition_id` text NOT NULL,
  `gap_kind` text NOT NULL,
  `valid_from` text,
  `valid_to` text,
  `evidence_url` text NOT NULL,
  `reason` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`provision_rendition_id`) REFERENCES `legal_provision_renditions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_temporal_gap_kind_check`
    CHECK (`gap_kind` IN ('unknown','ambiguous','disputed')),
  CONSTRAINT `legal_temporal_gap_interval_check`
    CHECK (`valid_from` IS NULL OR `valid_to` IS NULL OR `valid_from`<`valid_to`),
  CONSTRAINT `legal_temporal_gap_status_check` CHECK (`status` IN ('open','resolved')),
  CONSTRAINT `legal_temporal_gap_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `legal_temporal_coverage_gap_lookup_idx`
ON `legal_temporal_coverage_gaps` (`provision_rendition_id`,`status`,`valid_from`,`valid_to`);
--> statement-breakpoint
CREATE TABLE `legal_current_provision_pointers` (
  `provision_rendition_id` text PRIMARY KEY NOT NULL,
  `evidence_url` text NOT NULL,
  `verified_at` text NOT NULL,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`provision_rendition_id`) REFERENCES `legal_provision_renditions`(`id`) ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `legal_search_release_items` ADD COLUMN `language` text;
--> statement-breakpoint
ALTER TABLE `legal_search_release_items` ADD COLUMN `document_type` text;
--> statement-breakpoint
ALTER TABLE `legal_search_release_items` ADD COLUMN `valid_from` text;
--> statement-breakpoint
ALTER TABLE `legal_search_release_items` ADD COLUMN `valid_to` text;
--> statement-breakpoint
CREATE TRIGGER `legal_applicability_period_no_overlap`
BEFORE INSERT ON `legal_applicability_periods`
WHEN EXISTS (
  SELECT 1 FROM `legal_applicability_periods` existing
  WHERE existing.`provision_rendition_id`=NEW.`provision_rendition_id`
    AND (existing.`valid_to` IS NULL OR NEW.`valid_from`<existing.`valid_to`)
    AND (NEW.`valid_to` IS NULL OR existing.`valid_from`<NEW.`valid_to`)
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_APPLICABILITY_PERIOD_OVERLAP'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_text_revision_validity_no_update`
BEFORE UPDATE ON `legal_text_revision_validity`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TEMPORAL_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_applicability_periods_no_update`
BEFORE UPDATE ON `legal_applicability_periods`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TEMPORAL_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_temporal_coverage_gaps_no_update`
BEFORE UPDATE ON `legal_temporal_coverage_gaps`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TEMPORAL_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_current_provision_pointers_no_update`
BEFORE UPDATE ON `legal_current_provision_pointers`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TEMPORAL_EVIDENCE_IMMUTABLE'); END;
