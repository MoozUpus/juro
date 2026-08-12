-- Migration 0115: terminalize legacy document-analysis states that have no
-- deployed consumer. The original document/R2 objects and all existing audit
-- history are retained; this migration changes only the false-progress
-- projection and appends a content-free audit event for each affected row.
INSERT OR IGNORE INTO `workspace_audit_events`
  (`id`,`workspace_id`,`actor_user_id`,`entity_type`,`entity_id`,`action`,`metadata_json`,`created_at`)
SELECT
  'document-analysis-capacity-terminalization:' || `id`,
  `workspace_id`,
  NULL,
  'document_analysis',
  `id`,
  'analysis_capacity_terminalized',
  json_object(
    'fromStatus', `status`,
    'errorCode', 'DOCUMENT_ANALYSIS_CAPACITY_REQUIRED',
    'reason', 'no_deployed_streaming_or_chunked_handler'
  ),
  CURRENT_TIMESTAMP
FROM `document_analyses`
WHERE `status` IN ('awaiting_external_extraction','awaiting_chunked_analysis');
--> statement-breakpoint
UPDATE `document_analyses`
SET `status`='failed',
    `error_code`='DOCUMENT_ANALYSIS_CAPACITY_REQUIRED',
    `updated_at`=CURRENT_TIMESTAMP
WHERE `status` IN ('awaiting_external_extraction','awaiting_chunked_analysis');
