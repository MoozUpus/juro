-- Published source text remains immutable. The only permitted post-publication
-- mutation is deterministic Vectorize bookkeeping for the current verified
-- source version after a successful server-side upsert.
DROP TRIGGER `published_legal_source_chunks_update_guard`;
--> statement-breakpoint
CREATE TRIGGER `published_legal_source_chunks_update_guard`
BEFORE UPDATE ON `legal_source_chunks`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = OLD.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source chunks are immutable')
  WHERE NEW.`id` <> OLD.`id`
    OR NEW.`version_id` <> OLD.`version_id`
    OR NEW.`section_id` <> OLD.`section_id`
    OR NEW.`chunk_index` <> OLD.`chunk_index`
    OR NEW.`language` <> OLD.`language`
    OR NEW.`content_text` <> OLD.`content_text`
    OR NEW.`content_sha256` <> OLD.`content_sha256`
    OR NEW.`metadata_json` <> OLD.`metadata_json`
    OR NEW.`vector_id` IS NULL
    OR NEW.`vector_id` <> ('vec_' || OLD.`id`)
    OR NEW.`indexed_at` IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM `legal_source_current_activations` activation
      INNER JOIN `legal_sources` source ON source.`id` = activation.`source_id`
      INNER JOIN `legal_source_versions` version
        ON version.`id` = activation.`version_id`
       AND version.`source_id` = source.`id`
      INNER JOIN `legal_source_publications` publication
        ON publication.`id` = activation.`publication_id`
       AND publication.`version_id` = version.`id`
       AND publication.`source_id` = source.`id`
      WHERE activation.`version_id` = OLD.`version_id`
        AND source.`status` = 'verified'
        AND source.`verification_state` = 'verified'
        AND version.`status` = 'verified'
    );
END;
