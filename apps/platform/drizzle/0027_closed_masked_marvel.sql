ALTER TABLE `legal_review_queue` ADD `decision_notes` text;--> statement-breakpoint
ALTER TABLE `legal_review_queue` ADD `reviewed_parsed_sha256` text;--> statement-breakpoint
ALTER TABLE `legal_review_queue` ADD `decided_by_user_id` text REFERENCES user_profiles(id);--> statement-breakpoint
ALTER TABLE `legal_review_queue` ADD `decision_evidence_json` text;--> statement-breakpoint
ALTER TABLE `legal_review_queue` ADD `decision_evidence_sha256` text;--> statement-breakpoint
CREATE INDEX `legal_review_queue_decider_idx` ON `legal_review_queue` (`decided_by_user_id`,`decided_at`);--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_decision_evidence_insert_guard`
BEFORE INSERT ON `legal_review_queue`
FOR EACH ROW
WHEN NEW.`status` IN ('approved','rejected') OR
     NEW.`decision` IS NOT NULL OR NEW.`decision_notes` IS NOT NULL OR
     NEW.`reviewed_parsed_sha256` IS NOT NULL OR
     NEW.`decided_by_user_id` IS NOT NULL OR
     NEW.`decision_evidence_json` IS NOT NULL OR
     NEW.`decision_evidence_sha256` IS NOT NULL OR NEW.`decided_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legal review decision evidence invalid')
  WHERE COALESCE((
      ((NEW.`status` = 'approved' AND NEW.`decision` = 'approve') OR
       (NEW.`status` = 'rejected' AND NEW.`decision` = 'reject')) AND
      NEW.`decision_notes` IS NOT NULL AND
      length(NEW.`decision_notes`) BETWEEN 10 AND 2000 AND
      NEW.`reviewed_parsed_sha256` IS NOT NULL AND
      length(NEW.`reviewed_parsed_sha256`) = 64 AND
      NEW.`reviewed_parsed_sha256` NOT GLOB '*[^0-9a-f]*' AND
      NEW.`decided_by_user_id` IS NOT NULL AND
      NEW.`assigned_to_user_id` = NEW.`decided_by_user_id` AND
      NEW.`decision_evidence_json` IS NOT NULL AND
      length(NEW.`decision_evidence_json`) BETWEEN 2 AND 8192 AND
      json_valid(NEW.`decision_evidence_json`) = 1 AND
      json_extract(NEW.`decision_evidence_json`, '$.schemaVersion') = 1 AND
      json_extract(NEW.`decision_evidence_json`, '$.reviewId') = NEW.`id` AND
      json_extract(NEW.`decision_evidence_json`, '$.sourceId') = NEW.`source_id` AND
      json_extract(NEW.`decision_evidence_json`, '$.versionId') = NEW.`version_id` AND
      json_extract(NEW.`decision_evidence_json`, '$.rawContentSha256') =
        (SELECT `content_sha256` FROM `legal_source_versions` WHERE `id` = NEW.`version_id`) AND
      json_extract(NEW.`decision_evidence_json`, '$.parsedContentSha256') = NEW.`reviewed_parsed_sha256` AND
      json_extract(NEW.`decision_evidence_json`, '$.decision') = NEW.`decision` AND
      json_extract(NEW.`decision_evidence_json`, '$.notes') = NEW.`decision_notes` AND
      json_extract(NEW.`decision_evidence_json`, '$.reviewerUserId') = NEW.`decided_by_user_id` AND
      length(json_extract(NEW.`decision_evidence_json`, '$.reviewerSessionId')) > 0 AND
      json_array_length(json_extract(NEW.`decision_evidence_json`, '$.reviewerAssignmentIds')) BETWEEN 1 AND 16 AND
      length(json_extract(NEW.`decision_evidence_json`, '$.mfaVerifiedAt')) > 0 AND
      json_extract(NEW.`decision_evidence_json`, '$.decidedAt') = NEW.`decided_at` AND
      NEW.`decision_evidence_sha256` IS NOT NULL AND
      length(NEW.`decision_evidence_sha256`) = 64 AND
      NEW.`decision_evidence_sha256` NOT GLOB '*[^0-9a-f]*' AND
      NEW.`decided_at` IS NOT NULL
    ), 0) = 0;
END;--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_decision_evidence_update_guard`
BEFORE UPDATE ON `legal_review_queue`
FOR EACH ROW
WHEN NEW.`status` IN ('approved','rejected') OR
     NEW.`decision` IS NOT NULL OR NEW.`decision_notes` IS NOT NULL OR
     NEW.`reviewed_parsed_sha256` IS NOT NULL OR
     NEW.`decided_by_user_id` IS NOT NULL OR
     NEW.`decision_evidence_json` IS NOT NULL OR
     NEW.`decision_evidence_sha256` IS NOT NULL OR NEW.`decided_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legal review decision evidence invalid')
  WHERE COALESCE((
      ((NEW.`status` = 'approved' AND NEW.`decision` = 'approve') OR
       (NEW.`status` = 'rejected' AND NEW.`decision` = 'reject')) AND
      NEW.`decision_notes` IS NOT NULL AND
      length(NEW.`decision_notes`) BETWEEN 10 AND 2000 AND
      NEW.`reviewed_parsed_sha256` IS NOT NULL AND
      length(NEW.`reviewed_parsed_sha256`) = 64 AND
      NEW.`reviewed_parsed_sha256` NOT GLOB '*[^0-9a-f]*' AND
      NEW.`decided_by_user_id` IS NOT NULL AND
      NEW.`assigned_to_user_id` = NEW.`decided_by_user_id` AND
      NEW.`decision_evidence_json` IS NOT NULL AND
      length(NEW.`decision_evidence_json`) BETWEEN 2 AND 8192 AND
      json_valid(NEW.`decision_evidence_json`) = 1 AND
      json_extract(NEW.`decision_evidence_json`, '$.schemaVersion') = 1 AND
      json_extract(NEW.`decision_evidence_json`, '$.reviewId') = NEW.`id` AND
      json_extract(NEW.`decision_evidence_json`, '$.sourceId') = NEW.`source_id` AND
      json_extract(NEW.`decision_evidence_json`, '$.versionId') = NEW.`version_id` AND
      json_extract(NEW.`decision_evidence_json`, '$.rawContentSha256') =
        (SELECT `content_sha256` FROM `legal_source_versions` WHERE `id` = NEW.`version_id`) AND
      json_extract(NEW.`decision_evidence_json`, '$.parsedContentSha256') = NEW.`reviewed_parsed_sha256` AND
      json_extract(NEW.`decision_evidence_json`, '$.decision') = NEW.`decision` AND
      json_extract(NEW.`decision_evidence_json`, '$.notes') = NEW.`decision_notes` AND
      json_extract(NEW.`decision_evidence_json`, '$.reviewerUserId') = NEW.`decided_by_user_id` AND
      length(json_extract(NEW.`decision_evidence_json`, '$.reviewerSessionId')) > 0 AND
      json_array_length(json_extract(NEW.`decision_evidence_json`, '$.reviewerAssignmentIds')) BETWEEN 1 AND 16 AND
      length(json_extract(NEW.`decision_evidence_json`, '$.mfaVerifiedAt')) > 0 AND
      json_extract(NEW.`decision_evidence_json`, '$.decidedAt') = NEW.`decided_at` AND
      NEW.`decision_evidence_sha256` IS NOT NULL AND
      length(NEW.`decision_evidence_sha256`) = 64 AND
      NEW.`decision_evidence_sha256` NOT GLOB '*[^0-9a-f]*' AND
      NEW.`decided_at` IS NOT NULL
    ), 0) = 0;
END;--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_terminal_immutable_guard`
BEFORE UPDATE ON `legal_review_queue`
FOR EACH ROW
WHEN OLD.`status` IN ('approved','rejected') AND (
  NEW.`source_id` IS NOT OLD.`source_id` OR
  NEW.`version_id` IS NOT OLD.`version_id` OR
  NEW.`reason_code` IS NOT OLD.`reason_code` OR
  NEW.`confidence` IS NOT OLD.`confidence` OR
  NEW.`status` IS NOT OLD.`status` OR
  NEW.`assigned_to_user_id` IS NOT OLD.`assigned_to_user_id` OR
  NEW.`decision` IS NOT OLD.`decision` OR
  NEW.`decision_notes` IS NOT OLD.`decision_notes` OR
  NEW.`reviewed_parsed_sha256` IS NOT OLD.`reviewed_parsed_sha256` OR
  NEW.`decided_by_user_id` IS NOT OLD.`decided_by_user_id` OR
  NEW.`decision_evidence_json` IS NOT OLD.`decision_evidence_json` OR
  NEW.`decision_evidence_sha256` IS NOT OLD.`decision_evidence_sha256` OR
  NEW.`decided_at` IS NOT OLD.`decided_at`
)
BEGIN
  SELECT RAISE(ABORT, 'legal review terminal evidence is immutable');
END;--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_terminal_delete_guard`
BEFORE DELETE ON `legal_review_queue`
FOR EACH ROW
WHEN OLD.`status` IN ('approved','rejected')
BEGIN
  SELECT RAISE(ABORT, 'legal review terminal evidence cannot be deleted');
END;
