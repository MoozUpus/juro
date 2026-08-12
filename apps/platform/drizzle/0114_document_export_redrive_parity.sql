-- Migration 0114: keep the append-only redrive projection guard aligned with
-- retryable document-export jobs. This is deliberately additive at the data
-- level: it only replaces the write-time guard and does not rewrite jobs,
-- outbox rows, or historical redrive evidence.
DROP TRIGGER IF EXISTS `operational_job_redrive_projection_guard`;
--> statement-breakpoint
CREATE TRIGGER `operational_job_redrive_projection_guard`
BEFORE INSERT ON `operational_job_redrive_events`
WHEN NOT EXISTS (
  SELECT 1
  FROM `job_runs` AS j
  JOIN `job_outbox` AS o
    ON o.`id`=NEW.`outbox_id`
   AND o.`idempotency_key`=j.`idempotency_key`
  WHERE j.`id`=NEW.`source_job_id`
    AND j.`queue_name` LIKE NEW.`environment` || '-%'
    AND j.`status`=NEW.`previous_job_status`
    AND o.`status`=NEW.`previous_outbox_status`
    AND j.`job_type`=o.`job_type`
    AND j.`subject_id`=o.`subject_id`
    AND COALESCE(j.`workspace_id`,'')=COALESCE(o.`workspace_id`,'')
    AND j.`correlation_id`=o.`correlation_id`
    AND COALESCE(j.`error_code`,'')=COALESCE(NEW.`previous_error_code`,'')
    AND j.`attempt`=NEW.`previous_attempt`
    AND COALESCE(o.`dispatched_at`,'')=COALESCE(NEW.`previous_dispatched_at`,'')
    AND (j.`lease_expires_at` IS NULL OR j.`lease_expires_at`<=NEW.`created_at`)
    AND (
      j.`status`='retrying'
      OR j.`error_code` IN (
        'ASYNC_RUNTIME_DISABLED','JOB_SCHEMA_VERSION_MISMATCH','JOB_HANDLER_NOT_ENABLED',
        'JOB_TRANSIENT_FAILURE','JOB_LEASE_LOST',
        'DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE','DOCUMENT_ANALYSIS_PERSISTENCE_FAILED',
        'USER_DOCUMENT_INDEX_FAILED','OCR_PROVIDER_UNAVAILABLE','OCR_PERSISTENCE_FAILED',
        'DOCUMENT_EXPORT_NOT_READY','DOCUMENT_EXPORT_OBJECT_FAILED',
        'EMAIL_CONFIGURATION_UNAVAILABLE','EMAIL_PROVIDER_UNAVAILABLE',
        'OPERATIONAL_ALERT_CONFIGURATION_UNAVAILABLE','OPERATIONAL_ALERT_PROVIDER_UNAVAILABLE',
        'LEGAL_SOURCE_SYNC_FAILED','LEGAL_SOURCE_PARSE_FAILED','LEGAL_SOURCE_INDEX_FAILED',
        'NOTIFICATION_PERSISTENCE_FAILED','MALWARE_SCANNER_UNAVAILABLE',
        'MALWARE_SCAN_OBJECT_FAILED','MALWARE_SCAN_PERSISTENCE_FAILED'
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'OPERATIONAL_JOB_REDRIVE_NOT_ALLOWED');
END;
