-- Immutable evidence for promoting a malware-clean, owner-controlled document
-- analysis into the global JURO materials corpus. Legal text remains in the
-- private R2 bucket; this table stores only bounded identifiers and hashes.
CREATE TABLE `legal_corpus_owner_publications` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `analysis_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `file_id` text NOT NULL,
  `scan_result_id` text NOT NULL,
  `source_sha256` text NOT NULL,
  `extraction_sha256` text NOT NULL,
  `content_sha256` text NOT NULL,
  `document_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `version_id` text NOT NULL,
  `language` text NOT NULL,
  `rights_confirmed` integer NOT NULL,
  `legal_review_confirmed` integer NOT NULL,
  `reason` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_session_id` text NOT NULL,
  `actor_assignment_id` text NOT NULL,
  `actor_mfa_verified_at` text NOT NULL,
  `record_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`variant_id`) REFERENCES `legal_corpus_variants`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`version_id`) REFERENCES `legal_corpus_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_owner_publication_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_corpus_owner_publication_language_check` CHECK (`language` IN ('uz-Latn','uz-Cyrl','ru','en')),
  CONSTRAINT `legal_corpus_owner_publication_confirmations_check` CHECK (`rights_confirmed`=1 AND `legal_review_confirmed`=1),
  CONSTRAINT `legal_corpus_owner_publication_hashes_check` CHECK (
    length(`source_sha256`)=64 AND `source_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`extraction_sha256`)=64 AND `extraction_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*'
    AND length(`record_hash`)=64 AND `record_hash` NOT GLOB '*[^0-9A-F]*'
  ),
  CONSTRAINT `legal_corpus_owner_publication_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_owner_publications_analysis_language_uidx`
  ON `legal_corpus_owner_publications` (`analysis_id`,`language`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_owner_publications_record_hash_uidx`
  ON `legal_corpus_owner_publications` (`record_hash`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_owner_publications_recent_idx`
  ON `legal_corpus_owner_publications` (`environment`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_publications_insert_guard`
BEFORE INSERT ON `legal_corpus_owner_publications`
WHEN NOT EXISTS (
  SELECT 1
  FROM `document_analyses` analysis
  JOIN `document_files` file ON file.id=analysis.uploaded_file_id
  JOIN `file_extractions` extraction ON extraction.analysis_id=analysis.id
  JOIN `file_scan_results` scan ON scan.id=NEW.scan_result_id
    AND scan.analysis_id=analysis.id AND scan.file_id=file.id
    AND scan.workspace_id=analysis.workspace_id AND scan.owner_user_id=analysis.owner_user_id
  JOIN `platform_staff_assignments` assignment
    ON assignment.id=NEW.actor_assignment_id AND assignment.user_id=NEW.actor_user_id
  JOIN `legal_corpus_documents` document ON document.id=NEW.document_id
  JOIN `legal_corpus_variants` variant ON variant.id=NEW.variant_id AND variant.document_id=document.id
  JOIN `legal_corpus_versions` version ON version.id=NEW.version_id AND version.variant_id=variant.id
  WHERE analysis.id=NEW.analysis_id
    AND analysis.workspace_id=NEW.workspace_id
    AND analysis.owner_user_id=NEW.actor_user_id
    AND analysis.status='completed'
    AND file.id=NEW.file_id
    AND file.workspace_id=NEW.workspace_id
    AND file.owner_user_id=NEW.actor_user_id
    AND file.kind='analysis_safe'
    AND file.archived_at IS NULL
    AND lower(file.sha256)=NEW.source_sha256
    AND scan.verdict='clean'
    AND lower(scan.source_sha256)=NEW.source_sha256
    AND extraction.file_id=file.id
    AND extraction.workspace_id=analysis.workspace_id
    AND extraction.owner_user_id=analysis.owner_user_id
    AND extraction.status='completed'
    AND lower(extraction.text_sha256)=NEW.extraction_sha256
    AND assignment.role='legal_reviewer'
    AND assignment.granted_at<=NEW.created_at
    AND assignment.expires_at>NEW.created_at
    AND assignment.revoked_at IS NULL
    AND julianday(NEW.actor_mfa_verified_at)<=julianday(NEW.created_at)
    AND julianday(NEW.actor_mfa_verified_at)>=julianday(NEW.created_at)-(15.0/1440.0)
    AND document.provider='juro_owner'
    AND document.source_class='OWNER_TRUSTED_GLOBAL'
    AND document.scope='global'
    AND document.visibility='global'
    AND document.trusted=1
    AND document.verification_status='owner_approved'
    AND document.approval_required=0
    AND variant.language=NEW.language
    AND variant.current_version_id=version.id
    AND version.content_sha256=NEW.content_sha256
    AND NEW.rights_confirmed=1
    AND NEW.legal_review_confirmed=1
)
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_PUBLICATION_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_publications_immutable_guard`
BEFORE UPDATE ON `legal_corpus_owner_publications`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_PUBLICATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_publications_no_delete`
BEFORE DELETE ON `legal_corpus_owner_publications`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_PUBLICATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TABLE `legal_corpus_owner_withdrawals` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `publication_id` text NOT NULL,
  `document_id` text NOT NULL,
  `reason` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_session_id` text NOT NULL,
  `actor_assignment_id` text NOT NULL,
  `actor_mfa_verified_at` text NOT NULL,
  `record_hash` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`publication_id`) REFERENCES `legal_corpus_owner_publications`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`document_id`) REFERENCES `legal_corpus_documents`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_corpus_owner_withdrawal_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_corpus_owner_withdrawal_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
  CONSTRAINT `legal_corpus_owner_withdrawal_hash_check` CHECK (
    length(`record_hash`)=64 AND `record_hash` NOT GLOB '*[^0-9A-F]*'
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_owner_withdrawals_publication_uidx`
  ON `legal_corpus_owner_withdrawals` (`publication_id`);
--> statement-breakpoint
CREATE INDEX `legal_corpus_owner_withdrawals_recent_idx`
  ON `legal_corpus_owner_withdrawals` (`environment`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_withdrawals_insert_guard`
BEFORE INSERT ON `legal_corpus_owner_withdrawals`
WHEN NOT EXISTS (
  SELECT 1
  FROM `legal_corpus_owner_publications` publication
  JOIN `legal_corpus_documents` document
    ON document.id=publication.document_id AND document.id=NEW.document_id
  JOIN `platform_staff_assignments` assignment
    ON assignment.id=NEW.actor_assignment_id AND assignment.user_id=NEW.actor_user_id
  WHERE publication.id=NEW.publication_id
    AND publication.environment=NEW.environment
    AND publication.actor_user_id=NEW.actor_user_id
    AND assignment.role='legal_reviewer'
    AND assignment.granted_at<=NEW.created_at
    AND assignment.expires_at>NEW.created_at
    AND assignment.revoked_at IS NULL
    AND julianday(NEW.actor_mfa_verified_at)<=julianday(NEW.created_at)
    AND julianday(NEW.actor_mfa_verified_at)>=julianday(NEW.created_at)-(15.0/1440.0)
    AND document.provider='juro_owner'
    AND document.availability_status='ready'
)
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_WITHDRAWAL_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_withdrawals_apply`
AFTER INSERT ON `legal_corpus_owner_withdrawals`
BEGIN
  UPDATE `legal_corpus_documents`
  SET `availability_status`='disabled',`updated_at`=NEW.created_at
  WHERE `id`=NEW.document_id AND `provider`='juro_owner' AND `availability_status`='ready';
END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_withdrawals_immutable_guard`
BEFORE UPDATE ON `legal_corpus_owner_withdrawals`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_WITHDRAWAL_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_withdrawals_no_delete`
BEFORE DELETE ON `legal_corpus_owner_withdrawals`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_WITHDRAWAL_IMMUTABLE'); END;
