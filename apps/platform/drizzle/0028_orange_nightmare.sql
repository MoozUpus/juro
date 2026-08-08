CREATE TABLE `legal_source_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`source_id` text NOT NULL,
	`version_id` text NOT NULL,
	`review_evidence_sha256` text NOT NULL,
	`raw_content_sha256` text NOT NULL,
	`parsed_content_sha256` text NOT NULL,
	`published_by_user_id` text NOT NULL,
	`publication_evidence_json` text NOT NULL,
	`publication_evidence_sha256` text NOT NULL,
	`published_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `legal_review_queue`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`published_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_publications_review_uidx` ON `legal_source_publications` (`review_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_publications_version_uidx` ON `legal_source_publications` (`version_id`);--> statement-breakpoint
CREATE INDEX `legal_source_publications_source_idx` ON `legal_source_publications` (`source_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `legal_source_publications_publisher_idx` ON `legal_source_publications` (`published_by_user_id`,`published_at`);--> statement-breakpoint
CREATE TRIGGER `legal_source_publications_insert_guard`
BEFORE INSERT ON `legal_source_publications`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source publication hash evidence invalid')
  WHERE length(NEW.`review_evidence_sha256`) <> 64 OR
         NEW.`review_evidence_sha256` GLOB '*[^0-9a-f]*' OR
         length(NEW.`raw_content_sha256`) <> 64 OR
         NEW.`raw_content_sha256` GLOB '*[^0-9a-f]*' OR
         length(NEW.`parsed_content_sha256`) <> 64 OR
         NEW.`parsed_content_sha256` GLOB '*[^0-9a-f]*' OR
        length(NEW.`publication_evidence_sha256`) <> 64 OR
        NEW.`publication_evidence_sha256` GLOB '*[^0-9a-f]*';
  SELECT RAISE(ABORT, 'legal source publication review evidence invalid')
  WHERE NOT EXISTS (
      SELECT 1 FROM `legal_review_queue` review
      WHERE review.`id` = NEW.`review_id`
        AND review.`source_id` = NEW.`source_id`
        AND review.`version_id` = NEW.`version_id`
        AND review.`status` = 'approved'
        AND review.`decision` = 'approve'
        AND review.`decision_evidence_sha256` = NEW.`review_evidence_sha256`
        AND review.`reviewed_parsed_sha256` = NEW.`parsed_content_sha256`
        AND review.`decided_by_user_id` IS NOT NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM `legal_source_versions` version
      WHERE version.`id` = NEW.`version_id`
        AND version.`source_id` = NEW.`source_id`
        AND version.`status` = 'pending_review'
        AND version.`content_sha256` = NEW.`raw_content_sha256`
        AND version.`parsed_object_key` IS NOT NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM `legal_sources` source
      WHERE source.`id` = NEW.`source_id`
        AND source.`status` <> 'verified'
        AND source.`verification_state` <> 'verified'
        AND source.`content_sha256` = NEW.`raw_content_sha256`
    );
  SELECT RAISE(ABORT, 'legal source publication canonical evidence invalid')
  WHERE COALESCE((
      length(NEW.`publication_evidence_json`) BETWEEN 2 AND 8192 AND
      json_valid(NEW.`publication_evidence_json`) = 1 AND
      json_extract(NEW.`publication_evidence_json`, '$.schemaVersion') = 1 AND
      json_extract(NEW.`publication_evidence_json`, '$.publicationId') = NEW.`id` AND
      json_extract(NEW.`publication_evidence_json`, '$.reviewId') = NEW.`review_id` AND
      json_extract(NEW.`publication_evidence_json`, '$.sourceId') = NEW.`source_id` AND
      json_extract(NEW.`publication_evidence_json`, '$.versionId') = NEW.`version_id` AND
      json_extract(NEW.`publication_evidence_json`, '$.sourceKind') =
        (SELECT `source_type` FROM `legal_sources` WHERE `id` = NEW.`source_id`) AND
      json_extract(NEW.`publication_evidence_json`, '$.locale') =
        (SELECT `locale` FROM `legal_sources` WHERE `id` = NEW.`source_id`) AND
      json_extract(NEW.`publication_evidence_json`, '$.canonicalId') =
        (SELECT `canonical_id` FROM `legal_sources` WHERE `id` = NEW.`source_id`) AND
      json_extract(NEW.`publication_evidence_json`, '$.canonicalUrl') =
        (SELECT `official_url` FROM `legal_sources` WHERE `id` = NEW.`source_id`) AND
      length(json_extract(NEW.`publication_evidence_json`, '$.parserProfile')) BETWEEN 1 AND 128 AND
      json_extract(NEW.`publication_evidence_json`, '$.reviewEvidenceSha256') = NEW.`review_evidence_sha256` AND
      json_extract(NEW.`publication_evidence_json`, '$.rawContentSha256') = NEW.`raw_content_sha256` AND
      json_extract(NEW.`publication_evidence_json`, '$.parsedContentSha256') = NEW.`parsed_content_sha256` AND
      json_extract(NEW.`publication_evidence_json`, '$.publishedByUserId') = NEW.`published_by_user_id` AND
      length(json_extract(NEW.`publication_evidence_json`, '$.publisherSessionId')) > 0 AND
      json_type(NEW.`publication_evidence_json`, '$.publisherAssignmentIds') = 'array' AND
      json_array_length(json_extract(NEW.`publication_evidence_json`, '$.publisherAssignmentIds')) BETWEEN 1 AND 16 AND
      length(json_extract(NEW.`publication_evidence_json`, '$.mfaVerifiedAt')) > 0 AND
      json_extract(NEW.`publication_evidence_json`, '$.publishedAt') = NEW.`published_at` AND
      json_extract(NEW.`publication_evidence_json`, '$.sectionCount') BETWEEN 1 AND 300 AND
      json_extract(NEW.`publication_evidence_json`, '$.chunkCount') BETWEEN 1 AND 300 AND
      json_extract(NEW.`publication_evidence_json`, '$.sectionCount') =
        (SELECT count(*) FROM `legal_source_sections` WHERE `version_id` = NEW.`version_id`) AND
      json_extract(NEW.`publication_evidence_json`, '$.chunkCount') =
        (SELECT count(*) FROM `legal_source_chunks` WHERE `version_id` = NEW.`version_id`) AND
      (SELECT count(DISTINCT `sequence`) FROM `legal_source_sections`
        WHERE `version_id` = NEW.`version_id`) =
        (SELECT count(*) FROM `legal_source_sections` WHERE `version_id` = NEW.`version_id`) AND
      NOT EXISTS (
        SELECT 1 FROM `legal_source_sections` section
        WHERE section.`version_id` = NEW.`version_id` AND (
          section.`canonical_ref` IS NULL OR length(section.`canonical_ref`) = 0 OR
          length(section.`body_text`) NOT BETWEEN 1 AND 8000 OR
          length(section.`content_sha256`) <> 64 OR
          section.`content_sha256` GLOB '*[^0-9a-f]*' OR
          (SELECT count(*) FROM `legal_source_chunks` chunk
            WHERE chunk.`version_id` = NEW.`version_id`
              AND chunk.`section_id` = section.`id`) <> 1
        )
      ) AND
      NOT EXISTS (
        SELECT 1 FROM `legal_source_chunks` chunk
        INNER JOIN `legal_source_sections` section
          ON section.`id` = chunk.`section_id`
          AND section.`version_id` = chunk.`version_id`
        WHERE chunk.`version_id` = NEW.`version_id` AND (
          chunk.`chunk_index` <> section.`sequence` OR
          chunk.`language` <>
            (SELECT `locale` FROM `legal_sources` WHERE `id` = NEW.`source_id`) OR
          chunk.`content_text` <> section.`body_text` OR
          chunk.`content_sha256` <> section.`content_sha256` OR
          length(chunk.`content_text`) NOT BETWEEN 1 AND 8000 OR
          json_valid(chunk.`metadata_json`) <> 1 OR
          chunk.`vector_id` IS NOT NULL OR chunk.`indexed_at` IS NOT NULL
        )
      )
    ), 0) = 0;
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_publications_immutable_guard`
BEFORE UPDATE ON `legal_source_publications`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source publication evidence is immutable');
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_publications_delete_guard`
BEFORE DELETE ON `legal_source_publications`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source publication evidence cannot be deleted');
END;--> statement-breakpoint
CREATE TRIGGER `published_legal_source_sections_insert_guard`
BEFORE INSERT ON `legal_source_sections`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = NEW.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source sections are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `published_legal_source_sections_update_guard`
BEFORE UPDATE ON `legal_source_sections`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = OLD.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source sections are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `published_legal_source_sections_delete_guard`
BEFORE DELETE ON `legal_source_sections`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = OLD.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source sections are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `published_legal_source_chunks_insert_guard`
BEFORE INSERT ON `legal_source_chunks`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = NEW.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source chunks are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `published_legal_source_chunks_update_guard`
BEFORE UPDATE ON `legal_source_chunks`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = OLD.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source chunks are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `published_legal_source_chunks_delete_guard`
BEFORE DELETE ON `legal_source_chunks`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `legal_source_publications` WHERE `version_id` = OLD.`version_id`
)
BEGIN
  SELECT RAISE(ABORT, 'published legal source chunks are immutable');
END;
