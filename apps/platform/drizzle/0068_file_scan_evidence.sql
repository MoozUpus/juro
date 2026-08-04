-- Migration 0068: immutable malware-scan evidence for quarantined analysis files.
-- Expand-only. The scanner queue and service remain disabled until a real,
-- privacy-approved scanner passes staging review.
CREATE TABLE `file_scan_results` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `file_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `verdict` text NOT NULL,
  `provider` text NOT NULL,
  `engine` text NOT NULL,
  `engine_version` text NOT NULL,
  `signature_version` text NOT NULL,
  `provider_scan_id` text NOT NULL,
  `source_sha256` text NOT NULL,
  `response_sha256` text NOT NULL,
  `threats_json` text NOT NULL,
  `completed_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `file_scan_results_verdict_check` CHECK (`verdict` IN ('clean','infected')),
  CONSTRAINT `file_scan_results_source_sha_check` CHECK (length(`source_sha256`) = 64),
  CONSTRAINT `file_scan_results_response_sha_check` CHECK (length(`response_sha256`) = 64),
  CONSTRAINT `file_scan_results_threats_json_check` CHECK (
    json_valid(`threats_json`)
    AND json_type(`threats_json`) = 'array'
    AND ((`verdict` = 'clean' AND json_array_length(`threats_json`) = 0)
      OR (`verdict` = 'infected' AND json_array_length(`threats_json`) > 0))
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `file_scan_results_analysis_uidx` ON `file_scan_results` (`analysis_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `file_scan_results_file_uidx` ON `file_scan_results` (`file_id`);--> statement-breakpoint
CREATE INDEX `file_scan_results_workspace_created_idx` ON `file_scan_results` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `file_scan_result_source_guard`
BEFORE INSERT ON `file_scan_results`
WHEN NOT EXISTS (
    SELECT 1
    FROM `document_analyses` a
    JOIN `document_files` f ON f.`id` = a.`uploaded_file_id`
    WHERE a.`id` = NEW.`analysis_id`
      AND f.`id` = NEW.`file_id`
      AND a.`workspace_id` = NEW.`workspace_id`
      AND f.`workspace_id` = NEW.`workspace_id`
      AND a.`owner_user_id` = NEW.`owner_user_id`
      AND f.`owner_user_id` = NEW.`owner_user_id`
      AND lower(f.`sha256`) = lower(NEW.`source_sha256`)
      AND a.`status` = 'quarantined'
      AND f.`kind` = 'analysis_quarantined'
  )
BEGIN
  SELECT RAISE(ABORT, 'file_scan_source_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `file_scan_result_immutable_update`
BEFORE UPDATE ON `file_scan_results`
BEGIN
  SELECT RAISE(ABORT, 'file_scan_result_immutable');
END;
