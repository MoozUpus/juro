DROP TRIGGER `legal_corpus_owner_ingestions_insert_guard`;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_owner_ingestions_insert_guard`
BEFORE INSERT ON `legal_corpus_owner_ingestions`
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
    AND assignment.role IN ('administrator','legal_reviewer')
    AND assignment.granted_at<=NEW.created_at
    AND assignment.expires_at>NEW.created_at
    AND assignment.revoked_at IS NULL
    AND (
      (
        julianday(NEW.actor_mfa_verified_at)<=julianday(NEW.created_at)
        AND julianday(NEW.actor_mfa_verified_at)>=julianday(NEW.created_at)-(15.0/1440.0)
      )
      OR EXISTS (
        SELECT 1 FROM `legal_corpus_owner_upload_requests` request
        WHERE request.analysis_id=NEW.analysis_id
          AND request.workspace_id=NEW.workspace_id
          AND request.file_id=NEW.file_id
          AND request.source_sha256=NEW.source_sha256
          AND request.language=NEW.language
          AND request.reason=NEW.reason
          AND request.actor_user_id=NEW.actor_user_id
          AND request.actor_session_id=NEW.actor_session_id
          AND request.actor_assignment_id=NEW.actor_assignment_id
          AND request.actor_mfa_verified_at=NEW.actor_mfa_verified_at
          AND request.environment=NEW.environment
          AND request.rights_confirmed=1
          AND request.status='scan_queued'
          AND julianday(request.created_at)<=julianday(NEW.created_at)
      )
    )
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
    AND NEW.trust_mode='technical_auto_trust'
)
BEGIN
  SELECT RAISE(ABORT, 'LEGAL_CORPUS_OWNER_INGESTION_INVALID');
END;
