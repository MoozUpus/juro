CREATE TABLE `legal_corpus_owner_upload_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `analysis_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `file_id` text NOT NULL,
  `source_sha256` text NOT NULL,
  `title` text NOT NULL,
  `language` text NOT NULL,
  `rights_confirmed` integer NOT NULL,
  `reason` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_session_id` text NOT NULL,
  `actor_assignment_id` text NOT NULL,
  `actor_mfa_verified_at` text NOT NULL,
  `authorization_hash` text NOT NULL,
  `status` text NOT NULL DEFAULT 'scan_queued',
  `error_code` text,
  `published_document_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`actor_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_owner_upload_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_corpus_owner_upload_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_owner_upload_rights_check` CHECK (`rights_confirmed`=1),
  CONSTRAINT `legal_corpus_owner_upload_status_check` CHECK (`status` IN ('scan_queued','published','failed')),
  CONSTRAINT `legal_corpus_owner_upload_hash_check` CHECK (
    length(`source_sha256`)=64 AND lower(`source_sha256`)=`source_sha256`
    AND length(`authorization_hash`)=64 AND upper(`authorization_hash`)=`authorization_hash`
  ),
  CONSTRAINT `legal_corpus_owner_upload_title_check` CHECK (length(trim(`title`)) BETWEEN 2 AND 300),
  CONSTRAINT `legal_corpus_owner_upload_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_owner_upload_requests_analysis_uidx`
  ON `legal_corpus_owner_upload_requests` (`analysis_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_owner_upload_requests_authorization_hash_uidx`
  ON `legal_corpus_owner_upload_requests` (`authorization_hash`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_owner_upload_requests_status_idx`
  ON `legal_corpus_owner_upload_requests` (`environment`,`status`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_upload_requests_insert_guard`
BEFORE INSERT ON `legal_corpus_owner_upload_requests`
WHEN NOT EXISTS (
  SELECT 1
  FROM `document_analyses` analysis
  JOIN `document_files` file ON file.id=analysis.uploaded_file_id
  JOIN `platform_staff_assignments` assignment
    ON assignment.id=NEW.actor_assignment_id AND assignment.user_id=NEW.actor_user_id
  WHERE analysis.id=NEW.analysis_id
    AND analysis.workspace_id=NEW.workspace_id
    AND analysis.owner_user_id=NEW.actor_user_id
    AND analysis.status='quarantined'
    AND file.id=NEW.file_id
    AND file.workspace_id=NEW.workspace_id
    AND file.owner_user_id=NEW.actor_user_id
    AND file.kind='analysis_quarantined'
    AND file.archived_at IS NULL
    AND lower(file.sha256)=NEW.source_sha256
    AND assignment.role IN ('administrator','legal_reviewer')
    AND assignment.granted_at<=NEW.created_at
    AND assignment.expires_at>NEW.created_at
    AND assignment.revoked_at IS NULL
    AND julianday(NEW.actor_mfa_verified_at)<=julianday(NEW.created_at)
    AND julianday(NEW.actor_mfa_verified_at)>=julianday(NEW.created_at)-(15.0/1440.0)
)
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_UPLOAD_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_upload_requests_authorization_immutable`
BEFORE UPDATE ON `legal_corpus_owner_upload_requests`
WHEN NEW.id<>OLD.id OR NEW.environment<>OLD.environment OR NEW.analysis_id<>OLD.analysis_id
  OR NEW.workspace_id<>OLD.workspace_id OR NEW.file_id<>OLD.file_id
  OR NEW.source_sha256<>OLD.source_sha256 OR NEW.title<>OLD.title OR NEW.language<>OLD.language
  OR NEW.rights_confirmed<>OLD.rights_confirmed OR NEW.reason<>OLD.reason
  OR NEW.actor_user_id<>OLD.actor_user_id OR NEW.actor_session_id<>OLD.actor_session_id
  OR NEW.actor_assignment_id<>OLD.actor_assignment_id OR NEW.actor_mfa_verified_at<>OLD.actor_mfa_verified_at
  OR NEW.authorization_hash<>OLD.authorization_hash OR NEW.created_at<>OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_UPLOAD_AUTHORIZATION_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_upload_requests_no_delete`
BEFORE DELETE ON `legal_corpus_owner_upload_requests`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_UPLOAD_IMMUTABLE'); END;
