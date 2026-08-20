-- Version contents remain immutable. The sole permitted transition closes an
-- open validity interval when a newer official version becomes current.
DROP TRIGGER `legal_corpus_versions_immutable_guard`;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_versions_immutable_guard` BEFORE UPDATE ON `legal_corpus_versions`
FOR EACH ROW WHEN NOT (
  OLD.`id`=NEW.`id`
  AND OLD.`variant_id`=NEW.`variant_id`
  AND OLD.`previous_version_id` IS NEW.`previous_version_id`
  AND OLD.`version_number`=NEW.`version_number`
  AND OLD.`status`=NEW.`status`
  AND OLD.`valid_from` IS NEW.`valid_from`
  AND OLD.`valid_to` IS NULL
  AND NEW.`valid_to` IS NOT NULL
  AND (OLD.`valid_from` IS NULL OR NEW.`valid_to`>=OLD.`valid_from`)
  AND OLD.`version_date` IS NEW.`version_date`
  AND OLD.`content_sha256`=NEW.`content_sha256`
  AND OLD.`raw_object_key` IS NEW.`raw_object_key`
  AND OLD.`normalized_object_key` IS NEW.`normalized_object_key`
  AND OLD.`source_url` IS NEW.`source_url`
  AND OLD.`fetched_at`=NEW.`fetched_at`
  AND OLD.`change_type`=NEW.`change_type`
  AND OLD.`created_at`=NEW.`created_at`
)
BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_VERSION_IMMUTABLE'); END;
