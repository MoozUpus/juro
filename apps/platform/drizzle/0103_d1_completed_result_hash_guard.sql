-- Migration 0103: replace the D1-incompatible exact result-hash GLOB check.
DROP TRIGGER IF EXISTS `document_analyses_completed_result_guard`;--> statement-breakpoint
CREATE TRIGGER `document_analyses_completed_result_guard`
BEFORE UPDATE OF `status`,`summary_json`,`error_code`,`result_sha256` ON `document_analyses`
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_COMPLETED_RESULT_INVALID')
	WHERE NEW.`status`='completed' AND (
		NEW.`summary_json` IS NULL OR json_valid(NEW.`summary_json`)<>1
		OR NEW.`error_code` IS NOT NULL
		OR NEW.`result_sha256` IS NULL
		OR length(NEW.`result_sha256`)<>64
		OR NEW.`result_sha256` GLOB '*[^0-9a-f]*'
	);
	SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_COMPLETED_RESULT_IMMUTABLE')
	WHERE OLD.`status`='completed' AND (
		NEW.`status`<>OLD.`status`
		OR NEW.`summary_json`<>OLD.`summary_json`
		OR coalesce(NEW.`error_code`,'')<>coalesce(OLD.`error_code`,'')
		OR coalesce(NEW.`result_sha256`,'')<>coalesce(OLD.`result_sha256`,'')
	);
END;
