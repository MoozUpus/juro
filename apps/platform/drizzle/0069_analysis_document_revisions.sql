-- Migration 0069: immutable normalized analysis versions and reviewable AI revisions.
-- Expand-only. Builder revisions remain authoritative for builder documents; this
-- lifecycle belongs only to uploaded analysis artifacts.
CREATE TABLE `analysis_document_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `version` integer NOT NULL,
  `parent_version_id` text,
  `source_kind` text NOT NULL,
  `r2_key` text NOT NULL,
  `file_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `sha256` text NOT NULL,
  `idempotency_key` text,
  `selection_sha256` text,
  `revision_ids_json` text DEFAULT '[]' NOT NULL,
  `created_by_user_id` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`parent_version_id`) REFERENCES `analysis_document_versions`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `analysis_document_versions_version_check` CHECK (`version` >= 1),
  CONSTRAINT `analysis_document_versions_kind_check` CHECK (`source_kind` IN ('extracted','corrected')),
  CONSTRAINT `analysis_document_versions_mime_check` CHECK (`mime_type` = 'text/markdown; charset=utf-8'),
  CONSTRAINT `analysis_document_versions_size_check` CHECK (`size_bytes` > 0),
  CONSTRAINT `analysis_document_versions_sha_check` CHECK (length(`sha256`) = 64),
  CONSTRAINT `analysis_document_versions_selection_check` CHECK (`selection_sha256` IS NULL OR length(`selection_sha256`) = 64),
  CONSTRAINT `analysis_document_versions_revisions_check` CHECK (json_valid(`revision_ids_json`) AND json_type(`revision_ids_json`) = 'array')
);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_document_versions_number_uidx` ON `analysis_document_versions` (`analysis_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_document_versions_r2_key_uidx` ON `analysis_document_versions` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_document_versions_idempotency_uidx` ON `analysis_document_versions` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `analysis_document_versions_workspace_idx` ON `analysis_document_versions` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_source_guard`
BEFORE INSERT ON `analysis_document_versions`
WHEN NOT EXISTS (
  SELECT 1 FROM `document_analyses` analysis
  WHERE analysis.`id` = NEW.`analysis_id`
    AND analysis.`workspace_id` = NEW.`workspace_id`
    AND analysis.`owner_user_id` = NEW.`owner_user_id`
    AND (
      (NEW.`source_kind` = 'extracted'
        AND NEW.`version` = 1
        AND NEW.`parent_version_id` IS NULL
        AND NEW.`idempotency_key` IS NULL
        AND NEW.`selection_sha256` IS NULL
        AND json_array_length(NEW.`revision_ids_json`) = 0
        AND NEW.`created_by_user_id` IS NULL
        AND analysis.`status` IN ('processing','persisting','completed'))
      OR
      (NEW.`source_kind` = 'corrected'
        AND NEW.`version` > 1
        AND NEW.`parent_version_id` IS NOT NULL
        AND length(NEW.`idempotency_key`) BETWEEN 16 AND 160
        AND length(NEW.`selection_sha256`) = 64
        AND json_array_length(NEW.`revision_ids_json`) > 0
        AND NEW.`created_by_user_id` = NEW.`owner_user_id`
        AND analysis.`status` = 'completed')
    )
    AND NEW.`r2_key` LIKE 'analysis-versions/%'
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_document_version_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_parent_guard`
BEFORE INSERT ON `analysis_document_versions`
WHEN NEW.`version` > 1 AND NOT EXISTS (
  SELECT 1 FROM `analysis_document_versions` parent
  WHERE parent.`id` = NEW.`parent_version_id`
    AND parent.`analysis_id` = NEW.`analysis_id`
    AND parent.`workspace_id` = NEW.`workspace_id`
    AND parent.`owner_user_id` = NEW.`owner_user_id`
    AND parent.`version` = NEW.`version` - 1
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_document_version_parent_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_immutable_update`
BEFORE UPDATE ON `analysis_document_versions`
BEGIN
  SELECT RAISE(ABORT, 'analysis_document_version_immutable');
END;--> statement-breakpoint

CREATE TABLE `suggested_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `risk_id` text NOT NULL,
  `source_version_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `original_text` text NOT NULL,
  `proposed_text` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `decided_by_user_id` text,
  `decided_at` text,
  `applied_version_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`risk_id`) REFERENCES `document_risks`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`source_version_id`) REFERENCES `analysis_document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`decided_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`applied_version_id`) REFERENCES `analysis_document_versions`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `suggested_revisions_status_check` CHECK (`status` IN ('pending','accepted','rejected','applied','stale','ambiguous')),
  CONSTRAINT `suggested_revisions_original_check` CHECK (length(trim(`original_text`)) > 0),
  CONSTRAINT `suggested_revisions_proposed_check` CHECK (length(trim(`proposed_text`)) > 0),
  CONSTRAINT `suggested_revisions_decision_check` CHECK (
    (`status` = 'pending' AND `decided_by_user_id` IS NULL AND `decided_at` IS NULL AND `applied_version_id` IS NULL)
    OR (`status` IN ('accepted','rejected') AND `decided_by_user_id` IS NOT NULL AND `decided_at` IS NOT NULL AND `applied_version_id` IS NULL)
    OR (`status` = 'applied' AND `decided_by_user_id` IS NOT NULL AND `decided_at` IS NOT NULL AND `applied_version_id` IS NOT NULL)
    OR (`status` IN ('stale','ambiguous') AND `decided_by_user_id` IS NULL AND `decided_at` IS NOT NULL AND `applied_version_id` IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `suggested_revisions_risk_uidx` ON `suggested_revisions` (`risk_id`);--> statement-breakpoint
CREATE INDEX `suggested_revisions_analysis_status_idx` ON `suggested_revisions` (`analysis_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggested_revisions_workspace_idx` ON `suggested_revisions` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TRIGGER `suggested_revisions_source_guard`
BEFORE INSERT ON `suggested_revisions`
WHEN NOT EXISTS (
  SELECT 1
  FROM `document_analyses` analysis
  JOIN `document_risks` risk ON risk.`analysis_id` = analysis.`id`
  JOIN `analysis_document_versions` version ON version.`analysis_id` = analysis.`id`
  WHERE analysis.`id` = NEW.`analysis_id`
    AND analysis.`workspace_id` = NEW.`workspace_id`
    AND analysis.`owner_user_id` = NEW.`owner_user_id`
    AND risk.`id` = NEW.`risk_id`
    AND version.`id` = NEW.`source_version_id`
    AND version.`workspace_id` = NEW.`workspace_id`
    AND version.`owner_user_id` = NEW.`owner_user_id`
    AND version.`version` = 1
    AND version.`source_kind` = 'extracted'
    AND risk.`excerpt` = NEW.`original_text`
    AND risk.`proposed_wording` = NEW.`proposed_text`
)
BEGIN
  SELECT RAISE(ABORT, 'suggested_revision_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `suggested_revisions_identity_guard`
BEFORE UPDATE ON `suggested_revisions`
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`analysis_id` IS NOT OLD.`analysis_id`
  OR NEW.`risk_id` IS NOT OLD.`risk_id`
  OR NEW.`source_version_id` IS NOT OLD.`source_version_id`
  OR NEW.`workspace_id` IS NOT OLD.`workspace_id`
  OR NEW.`owner_user_id` IS NOT OLD.`owner_user_id`
  OR NEW.`original_text` IS NOT OLD.`original_text`
  OR NEW.`proposed_text` IS NOT OLD.`proposed_text`
  OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'suggested_revision_identity_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `suggested_revisions_lifecycle_guard`
BEFORE UPDATE ON `suggested_revisions`
WHEN NOT (
  (OLD.`status` = 'pending' AND NEW.`status` IN ('pending','accepted','rejected','applied','stale','ambiguous'))
  OR (OLD.`status` = 'accepted' AND NEW.`status` IN ('accepted','rejected','applied','stale','ambiguous'))
  OR (OLD.`status` = 'rejected' AND NEW.`status` IN ('rejected','accepted'))
  OR (OLD.`status` IN ('applied','stale','ambiguous') AND NEW.`status` = OLD.`status`)
)
BEGIN
  SELECT RAISE(ABORT, 'suggested_revision_lifecycle_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `suggested_revisions_applied_version_guard`
BEFORE UPDATE ON `suggested_revisions`
WHEN NEW.`status` = 'applied' AND NOT EXISTS (
  SELECT 1 FROM `analysis_document_versions` version
  WHERE version.`id` = NEW.`applied_version_id`
    AND version.`analysis_id` = NEW.`analysis_id`
    AND version.`workspace_id` = NEW.`workspace_id`
    AND version.`owner_user_id` = NEW.`owner_user_id`
    AND version.`source_kind` = 'corrected'
)
BEGIN
  SELECT RAISE(ABORT, 'suggested_revision_applied_version_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `analysis_document_versions_revision_guard`
BEFORE INSERT ON `analysis_document_versions`
WHEN NEW.`source_kind` = 'corrected' AND (
  (SELECT count(*) FROM json_each(NEW.`revision_ids_json`)) <>
    (SELECT count(DISTINCT value) FROM json_each(NEW.`revision_ids_json`))
  OR EXISTS (
  SELECT 1
  FROM json_each(NEW.`revision_ids_json`) selected
  LEFT JOIN `suggested_revisions` revision ON revision.`id` = selected.`value`
  WHERE revision.`id` IS NULL
    OR revision.`analysis_id` <> NEW.`analysis_id`
    OR revision.`workspace_id` <> NEW.`workspace_id`
    OR revision.`owner_user_id` <> NEW.`owner_user_id`
    OR revision.`status` NOT IN ('pending','accepted')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'analysis_document_version_revision_mismatch');
END;
