WITH guard AS (
  SELECT COUNT(*) AS locks FROM scheduled_locks
)
SELECT
 guard.locks,
 (SELECT acquisition_state FROM legal_corpus_shard_control WHERE singleton_id=1) AS acquisition_state,
 (SELECT COUNT(*) FROM legal_corpus_documents) AS documents,
 (SELECT COUNT(*) FROM legal_corpus_variants) AS variants,
 (SELECT COUNT(DISTINCT p.document_id||'|'||coalesce(p.article_number_normalized,'#'||p.sequence)) FROM legal_corpus_provisions p JOIN legal_corpus_variants v ON v.current_version_id=p.version_id) AS exact_unique_current_provisions,
 (SELECT COUNT(*) FROM legal_corpus_provisions p JOIN legal_corpus_variants v ON v.current_version_id=p.version_id) AS physical_current_provisions,
 (SELECT COUNT(*) FROM legal_corpus_chunks c JOIN legal_corpus_variants v ON v.current_version_id=c.version_id) AS current_chunks,
 (SELECT COUNT(*) FROM legal_corpus_chunks c JOIN legal_corpus_variants v ON v.current_version_id=c.version_id WHERE c.indexed_at IS NOT NULL) AS indexed_current_chunks,
 (SELECT COUNT(*) FROM legal_corpus_variants WHERE current_version_id IS NULL) AS unversioned_variants,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE job_type='fetch' AND status='completed') AS fetch_completed,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE job_type='fetch' AND status='queued') AS fetch_queued,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE job_type='version' AND status='completed') AS version_completed,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE job_type='version' AND status='queued') AS version_queued,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE status='retrying') AS retrying_jobs,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE status='failed') AS failed_jobs,
 (SELECT COUNT(*) FROM legal_corpus_ingestion_jobs WHERE status='dead_letter') AS dead_letter_jobs,
 (SELECT COUNT(*) FROM legal_corpus_discovery_checkpoints) AS checkpoints_total,
 (SELECT COUNT(*) FROM legal_corpus_discovery_checkpoints WHERE status='completed') AS checkpoints_completed,
 (SELECT COUNT(*) FROM legal_corpus_discovery_checkpoints WHERE status='completed' AND expected_document_count=discovered_document_count) AS checkpoints_aligned,
 (SELECT COUNT(*) FROM legal_corpus_discovery_checkpoints WHERE last_error_code IS NOT NULL) AS checkpoints_with_error,
 (SELECT COUNT(*) FROM legal_corpus_core_code_targets) AS core_targets_total,
 (SELECT COUNT(*) FROM legal_corpus_core_code_targets WHERE status='indexed') AS core_targets_indexed,
 (SELECT COUNT(*) FROM legal_corpus_failures) AS failure_ledger_total,
 (SELECT COUNT(*) FROM legal_corpus_failures WHERE retry_state IN ('terminal','technically_unavailable')) AS terminal_or_unavailable_failures,
 (SELECT COUNT(*) FROM legal_corpus_versions x WHERE NOT EXISTS (SELECT 1 FROM legal_corpus_provisions p WHERE p.version_id=x.id)) AS empty_version_headers,
 (SELECT COUNT(*) FROM legal_corpus_variants v WHERE v.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM legal_corpus_versions x WHERE x.id=v.current_version_id AND x.variant_id=v.id)) AS broken_current_pointers,
 (SELECT COUNT(*) FROM legal_corpus_variants v WHERE NOT EXISTS (SELECT 1 FROM legal_corpus_documents d WHERE d.id=v.document_id)) AS orphan_variants,
 (SELECT COUNT(*) FROM legal_corpus_versions x WHERE NOT EXISTS (SELECT 1 FROM legal_corpus_variants v WHERE v.id=x.variant_id)) AS orphan_versions,
 (SELECT COUNT(*) FROM legal_corpus_provisions p LEFT JOIN legal_corpus_documents d ON d.id=p.document_id LEFT JOIN legal_corpus_variants v ON v.id=p.variant_id LEFT JOIN legal_corpus_versions x ON x.id=p.version_id WHERE d.id IS NULL OR v.id IS NULL OR x.id IS NULL OR v.document_id<>p.document_id OR x.variant_id<>p.variant_id) AS provision_integrity_errors,
 (SELECT COUNT(*) FROM legal_corpus_chunks c LEFT JOIN legal_corpus_provisions p ON p.id=c.provision_id LEFT JOIN legal_corpus_versions x ON x.id=c.version_id WHERE p.id IS NULL OR x.id IS NULL OR p.version_id<>c.version_id) AS chunk_integrity_errors,
 (SELECT COUNT(*) FROM legal_corpus_chunks c JOIN legal_corpus_variants v ON v.current_version_id=c.version_id WHERE NOT EXISTS (SELECT 1 FROM legal_corpus_sparse_terms s WHERE s.chunk_id=c.id) AND NOT EXISTS (SELECT 1 FROM legal_corpus_sparse_chunk_keys ck JOIN legal_corpus_sparse_postings sp ON sp.chunk_key_id=ck.id WHERE ck.chunk_id=c.id)) AS current_chunks_missing_sparse,
 (SELECT COUNT(*) FROM (SELECT job.id FROM legal_corpus_ingestion_jobs job JOIN legal_corpus_failures failure ON failure.job_id=job.id WHERE job.status='completed' AND job.handoff_id IS NULL AND failure.retryable=1 AND failure.error_code IN ('LEGAL_CORPUS_STALE_RUNNING_TIMEOUT','LEGAL_CORPUS_INGESTION_FAILED') GROUP BY job.id,job.attempt_count HAVING job.attempt_count=MAX(failure.retry_count)+1)) AS completion_revalidation_candidates
FROM guard
WHERE guard.locks=0;
