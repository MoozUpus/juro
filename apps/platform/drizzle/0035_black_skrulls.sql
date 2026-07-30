CREATE TABLE `legal_source_current_activations` (
	`source_id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`version_id` text NOT NULL,
	`activated_by_user_id` text NOT NULL,
	`activated_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`publication_id`) REFERENCES `legal_source_publications`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`activated_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_current_activations_publication_uidx` ON `legal_source_current_activations` (`publication_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_current_activations_version_uidx` ON `legal_source_current_activations` (`version_id`);--> statement-breakpoint
CREATE INDEX `legal_source_current_activations_actor_idx` ON `legal_source_current_activations` (`activated_by_user_id`,`activated_at`);--> statement-breakpoint
CREATE TABLE `legal_source_lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`version_id` text NOT NULL,
	`previous_publication_id` text,
	`previous_version_id` text,
	`event_type` text NOT NULL,
	`reason_notes` text,
	`acted_by_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`actor_assignment_ids_json` text NOT NULL,
	`mfa_verified_at` text NOT NULL,
	`evidence_json` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`publication_id`) REFERENCES `legal_source_publications`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`previous_publication_id`) REFERENCES `legal_source_publications`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`previous_version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`acted_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `legal_source_lifecycle_events_source_idx` ON `legal_source_lifecycle_events` (`source_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `legal_source_lifecycle_events_publication_idx` ON `legal_source_lifecycle_events` (`publication_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `legal_source_lifecycle_events_actor_idx` ON `legal_source_lifecycle_events` (`acted_by_user_id`,`occurred_at`);
--> statement-breakpoint
DROP TRIGGER `legal_sources_verification_update_guard`;--> statement-breakpoint
CREATE TRIGGER `legal_sources_verification_update_guard`
BEFORE UPDATE OF `verification_state`,`source_type`,`content_sha256`,`verified_at`,`verified_by_user_id` ON `legal_sources`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source verification state invalid')
  WHERE NEW.`verification_state` NOT IN ('draft','fetched','pending_review','verified','rejected','archived','unavailable');
  SELECT RAISE(ABORT, 'legal source type invalid')
  WHERE NEW.`source_type` NOT IN ('lex','advice','internal');
  SELECT RAISE(ABORT, 'verified legal source requires exact evidence')
  WHERE NEW.`verification_state` = 'verified' AND (
      NEW.`verified_at` IS NULL OR NEW.`verified_by_user_id` IS NULL OR
      NEW.`content_sha256` IS NULL OR length(NEW.`content_sha256`) <> 64 OR
      NEW.`content_sha256` GLOB '*[^0-9a-f]*' OR
      NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id` = NEW.`verified_by_user_id`)
    );
  SELECT RAISE(ABORT, 'verified legal source evidence is immutable')
  WHERE OLD.`verification_state` = 'verified' AND NEW.`verification_state` = 'verified' AND (
      NEW.`content_sha256` <> OLD.`content_sha256` OR
      NEW.`verified_at` <> OLD.`verified_at` OR
      NEW.`verified_by_user_id` <> OLD.`verified_by_user_id`
    ) AND NOT EXISTS (
      SELECT 1
      FROM `legal_source_publications` publication
      INNER JOIN `legal_source_versions` version
        ON version.`id` = publication.`version_id`
       AND version.`source_id` = publication.`source_id`
      WHERE publication.`source_id` = NEW.`id`
        AND publication.`raw_content_sha256` = NEW.`content_sha256`
        AND publication.`published_at` = NEW.`verified_at`
        AND publication.`published_by_user_id` = NEW.`verified_by_user_id`
        AND version.`status` = 'verified'
        AND version.`content_sha256` = NEW.`content_sha256`
    );
END;--> statement-breakpoint
DROP TRIGGER `legal_source_publications_insert_guard`;--> statement-breakpoint
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
        AND (
          (
            source.`status` <> 'verified'
            AND source.`verification_state` <> 'verified'
            AND (
              source.`content_sha256` = NEW.`raw_content_sha256` OR (
                NOT EXISTS (
                  SELECT 1 FROM `legal_source_current_activations`
                  WHERE `source_id` = source.`id`
                ) AND EXISTS (
                  SELECT 1 FROM `legal_source_lifecycle_events` withdrawn
                  WHERE withdrawn.`source_id` = source.`id`
                    AND withdrawn.`event_type` = 'withdrawn'
                )
              )
            )
          ) OR (
            source.`status` = 'verified'
            AND source.`verification_state` = 'verified'
            AND EXISTS (
              SELECT 1
              FROM `legal_source_current_activations` current
              INNER JOIN `legal_source_publications` active_publication
                ON active_publication.`id` = current.`publication_id`
              WHERE current.`source_id` = source.`id`
                AND current.`version_id` <> NEW.`version_id`
                AND active_publication.`source_id` = source.`id`
                AND active_publication.`raw_content_sha256` = source.`content_sha256`
            )
          )
        )
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
CREATE TRIGGER `legal_source_lifecycle_events_insert_guard`
BEFORE INSERT ON `legal_source_lifecycle_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source lifecycle event invalid')
  WHERE NEW.`event_type` NOT IN ('activated_initial','activated_replacement','withdrawn')
     OR length(NEW.`evidence_sha256`) <> 64
     OR NEW.`evidence_sha256` GLOB '*[^0-9a-f]*'
     OR json_valid(NEW.`actor_assignment_ids_json`) <> 1
     OR json_type(NEW.`actor_assignment_ids_json`) <> 'array'
     OR json_array_length(NEW.`actor_assignment_ids_json`) NOT BETWEEN 1 AND 16
     OR length(NEW.`actor_session_id`) NOT BETWEEN 1 AND 180
     OR length(NEW.`mfa_verified_at`) = 0
     OR length(NEW.`occurred_at`) = 0;
  SELECT RAISE(ABORT, 'legal source lifecycle evidence invalid')
  WHERE COALESCE((
      length(NEW.`evidence_json`) BETWEEN 2 AND 8192 AND
      json_valid(NEW.`evidence_json`) = 1 AND
      json_extract(NEW.`evidence_json`, '$.schemaVersion') = 1 AND
      json_extract(NEW.`evidence_json`, '$.eventId') = NEW.`id` AND
      json_extract(NEW.`evidence_json`, '$.eventType') = NEW.`event_type` AND
      json_extract(NEW.`evidence_json`, '$.sourceId') = NEW.`source_id` AND
      json_extract(NEW.`evidence_json`, '$.publicationId') = NEW.`publication_id` AND
      json_extract(NEW.`evidence_json`, '$.versionId') = NEW.`version_id` AND
      json_extract(NEW.`evidence_json`, '$.previousPublicationId') IS NEW.`previous_publication_id` AND
      json_extract(NEW.`evidence_json`, '$.previousVersionId') IS NEW.`previous_version_id` AND
      json_extract(NEW.`evidence_json`, '$.reasonNotes') IS NEW.`reason_notes` AND
      json_extract(NEW.`evidence_json`, '$.actedByUserId') = NEW.`acted_by_user_id` AND
      json_extract(NEW.`evidence_json`, '$.actorSessionId') = NEW.`actor_session_id` AND
      json(json_extract(NEW.`evidence_json`, '$.actorAssignmentIds')) = json(NEW.`actor_assignment_ids_json`) AND
      json_extract(NEW.`evidence_json`, '$.mfaVerifiedAt') = NEW.`mfa_verified_at` AND
      json_extract(NEW.`evidence_json`, '$.occurredAt') = NEW.`occurred_at`
    ), 0) = 0;
  SELECT RAISE(ABORT, 'legal source lifecycle target invalid')
  WHERE NOT EXISTS (
      SELECT 1
      FROM `legal_source_publications` publication
      INNER JOIN `legal_source_versions` version
        ON version.`id` = publication.`version_id`
       AND version.`source_id` = publication.`source_id`
      INNER JOIN `legal_sources` source
        ON source.`id` = publication.`source_id`
      WHERE publication.`id` = NEW.`publication_id`
        AND publication.`source_id` = NEW.`source_id`
        AND publication.`version_id` = NEW.`version_id`
        AND version.`status` = 'verified'
        AND source.`status` = 'verified'
        AND source.`verification_state` = 'verified'
        AND source.`content_sha256` = publication.`raw_content_sha256`
    );
  SELECT RAISE(ABORT, 'legal source lifecycle transition invalid')
  WHERE (
      NEW.`event_type` = 'activated_initial'
      AND (
        NEW.`previous_publication_id` IS NOT NULL OR
        NEW.`previous_version_id` IS NOT NULL OR
        NEW.`reason_notes` IS NOT NULL OR
        EXISTS (SELECT 1 FROM `legal_source_current_activations` WHERE `source_id` = NEW.`source_id`) OR
        EXISTS (
          SELECT 1 FROM `legal_source_lifecycle_events`
          WHERE `source_id` = NEW.`source_id`
            AND `event_type` IN ('activated_initial','activated_replacement')
        )
      )
    ) OR (
      NEW.`event_type` = 'activated_replacement'
      AND (
        NEW.`previous_publication_id` IS NULL OR
        NEW.`previous_version_id` IS NULL OR
        NEW.`reason_notes` IS NOT NULL OR
        EXISTS (
          SELECT 1 FROM `legal_source_lifecycle_events` prior_replacement
          WHERE prior_replacement.`source_id` = NEW.`source_id`
            AND prior_replacement.`event_type` = 'activated_replacement'
            AND prior_replacement.`previous_publication_id` = NEW.`previous_publication_id`
            AND prior_replacement.`previous_version_id` = NEW.`previous_version_id`
        ) OR
        NOT (
          EXISTS (
            SELECT 1 FROM `legal_source_current_activations` current
            WHERE current.`source_id` = NEW.`source_id`
              AND current.`publication_id` = NEW.`previous_publication_id`
              AND current.`version_id` = NEW.`previous_version_id`
          ) OR (
            NOT EXISTS (
              SELECT 1 FROM `legal_source_current_activations`
              WHERE `source_id` = NEW.`source_id`
            ) AND EXISTS (
              SELECT 1 FROM `legal_source_lifecycle_events` prior
              WHERE prior.`source_id` = NEW.`source_id`
                AND prior.`publication_id` = NEW.`previous_publication_id`
                AND prior.`version_id` = NEW.`previous_version_id`
                AND prior.`event_type` = 'withdrawn'
            )
          )
        )
      )
    ) OR (
      NEW.`event_type` = 'withdrawn'
      AND (
        NEW.`previous_publication_id` IS NOT NULL OR
        NEW.`previous_version_id` IS NOT NULL OR
        NEW.`reason_notes` IS NULL OR
        length(NEW.`reason_notes`) NOT BETWEEN 10 AND 2000 OR
        EXISTS (
          SELECT 1 FROM `legal_source_lifecycle_events` prior_withdrawal
          WHERE prior_withdrawal.`source_id` = NEW.`source_id`
            AND prior_withdrawal.`publication_id` = NEW.`publication_id`
            AND prior_withdrawal.`version_id` = NEW.`version_id`
            AND prior_withdrawal.`event_type` = 'withdrawn'
        ) OR
        NOT EXISTS (
          SELECT 1 FROM `legal_source_current_activations` current
          WHERE current.`source_id` = NEW.`source_id`
            AND current.`publication_id` = NEW.`publication_id`
            AND current.`version_id` = NEW.`version_id`
        )
      )
    );
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_lifecycle_events_update_guard`
BEFORE UPDATE ON `legal_source_lifecycle_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source lifecycle evidence is immutable');
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_lifecycle_events_delete_guard`
BEFORE DELETE ON `legal_source_lifecycle_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source lifecycle evidence cannot be deleted');
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_current_activations_insert_guard`
BEFORE INSERT ON `legal_source_current_activations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source current activation invalid')
  WHERE NOT EXISTS (
      SELECT 1
      FROM `legal_source_publications` publication
      INNER JOIN `legal_source_versions` version
        ON version.`id` = publication.`version_id`
       AND version.`source_id` = publication.`source_id`
      INNER JOIN `legal_sources` source
        ON source.`id` = publication.`source_id`
      INNER JOIN `legal_source_lifecycle_events` lifecycle
        ON lifecycle.`publication_id` = publication.`id`
       AND lifecycle.`version_id` = version.`id`
       AND lifecycle.`source_id` = source.`id`
       AND lifecycle.`event_type` IN ('activated_initial','activated_replacement')
      WHERE publication.`id` = NEW.`publication_id`
        AND publication.`source_id` = NEW.`source_id`
        AND publication.`version_id` = NEW.`version_id`
        AND version.`status` = 'verified'
        AND source.`status` = 'verified'
        AND source.`verification_state` = 'verified'
        AND source.`content_sha256` = publication.`raw_content_sha256`
        AND lifecycle.`acted_by_user_id` = NEW.`activated_by_user_id`
        AND lifecycle.`occurred_at` = NEW.`activated_at`
    );
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_current_activations_update_guard`
BEFORE UPDATE ON `legal_source_current_activations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source current activation invalid')
  WHERE NEW.`source_id` <> OLD.`source_id` OR NOT EXISTS (
      SELECT 1
      FROM `legal_source_publications` publication
      INNER JOIN `legal_source_versions` version
        ON version.`id` = publication.`version_id`
       AND version.`source_id` = publication.`source_id`
      INNER JOIN `legal_sources` source
        ON source.`id` = publication.`source_id`
      INNER JOIN `legal_source_lifecycle_events` lifecycle
        ON lifecycle.`publication_id` = publication.`id`
       AND lifecycle.`version_id` = version.`id`
       AND lifecycle.`source_id` = source.`id`
       AND lifecycle.`event_type` = 'activated_replacement'
      WHERE publication.`id` = NEW.`publication_id`
        AND publication.`source_id` = NEW.`source_id`
        AND publication.`version_id` = NEW.`version_id`
        AND lifecycle.`previous_publication_id` = OLD.`publication_id`
        AND lifecycle.`previous_version_id` = OLD.`version_id`
        AND version.`status` = 'verified'
        AND source.`status` = 'verified'
        AND source.`verification_state` = 'verified'
        AND source.`content_sha256` = publication.`raw_content_sha256`
        AND lifecycle.`acted_by_user_id` = NEW.`activated_by_user_id`
        AND lifecycle.`occurred_at` = NEW.`activated_at`
    );
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_current_activations_delete_guard`
BEFORE DELETE ON `legal_source_current_activations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source current activation cannot be removed without withdrawal evidence')
  WHERE NOT EXISTS (
      SELECT 1 FROM `legal_source_lifecycle_events`
      WHERE `source_id` = OLD.`source_id`
        AND `publication_id` = OLD.`publication_id`
        AND `version_id` = OLD.`version_id`
        AND `event_type` = 'withdrawn'
    );
END;