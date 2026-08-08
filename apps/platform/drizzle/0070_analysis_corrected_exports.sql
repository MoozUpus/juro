-- Migration 0070: normalized corrected-version DOCX/PDF exports.
-- Expand-only: existing analysis report exports remain `analysis_report`.
ALTER TABLE `analysis_report_exports` ADD COLUMN `variant` text NOT NULL DEFAULT 'analysis_report';--> statement-breakpoint
ALTER TABLE `analysis_report_exports` ADD COLUMN `source_version_id` text REFERENCES `analysis_document_versions`(`id`) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `analysis_report_exports_source_version_idx` ON `analysis_report_exports` (`source_version_id`,`variant`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `analysis_report_exports_variant_insert_guard`
BEFORE INSERT ON `analysis_report_exports`
WHEN NOT (
  (NEW.`variant` = 'analysis_report' AND NEW.`source_version_id` IS NULL)
  OR
  (NEW.`variant` IN ('corrected_clean','corrected_redline') AND EXISTS (
    SELECT 1 FROM `analysis_document_versions` version
    WHERE version.`id` = NEW.`source_version_id`
      AND version.`analysis_id` = NEW.`analysis_id`
      AND version.`workspace_id` = NEW.`workspace_id`
      AND version.`owner_user_id` = NEW.`owner_user_id`
      AND version.`source_kind` = 'corrected'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_report_export_variant_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_report_exports_variant_update_guard`
BEFORE UPDATE ON `analysis_report_exports`
WHEN NEW.`variant` IS NOT OLD.`variant`
  OR NEW.`source_version_id` IS NOT OLD.`source_version_id`
BEGIN
  SELECT RAISE(ABORT, 'analysis_report_export_variant_immutable');
END;
