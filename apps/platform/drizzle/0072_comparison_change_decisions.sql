-- Migration 0072: review decisions for individual comparison changes.
-- Expand-only. A decision records review intent and never creates or merges a
-- third document version automatically.
ALTER TABLE `comparison_changes` ADD COLUMN `review_decision` text;--> statement-breakpoint
ALTER TABLE `comparison_changes` ADD COLUMN `decided_by_user_id` text REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `comparison_changes` ADD COLUMN `decided_at` text;--> statement-breakpoint
ALTER TABLE `comparison_changes` ADD COLUMN `review_decision_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comparison_changes` ADD COLUMN `review_decision_event_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `comparison_changes_decision_event_uidx` ON `comparison_changes` (`review_decision_event_id`) WHERE `review_decision_event_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `comparison_changes_decision_idx` ON `comparison_changes` (`comparison_id`,`review_decision`,`ordinal`);--> statement-breakpoint
CREATE TRIGGER `comparison_changes_decision_insert_guard`
BEFORE INSERT ON `comparison_changes`
WHEN NEW.`review_decision` IS NOT NULL
  OR NEW.`decided_by_user_id` IS NOT NULL
  OR NEW.`decided_at` IS NOT NULL
  OR NEW.`review_decision_version` <> 0
  OR NEW.`review_decision_event_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'comparison_change_decision_insert_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `comparison_changes_decision_update_guard`
BEFORE UPDATE OF `review_decision`,`decided_by_user_id`,`decided_at`,`review_decision_version`,`review_decision_event_id`
ON `comparison_changes`
WHEN NOT (
  (
    NEW.`review_decision` IS OLD.`review_decision`
    AND NEW.`decided_by_user_id` IS OLD.`decided_by_user_id`
    AND NEW.`decided_at` IS OLD.`decided_at`
    AND NEW.`review_decision_version` = OLD.`review_decision_version`
    AND NEW.`review_decision_event_id` IS OLD.`review_decision_event_id`
  )
  OR
  (
    NEW.`review_decision` IS OLD.`review_decision`
    AND OLD.`decided_by_user_id` IS NOT NULL
    AND NEW.`decided_by_user_id` IS NULL
    AND NEW.`decided_at` IS OLD.`decided_at`
    AND NEW.`review_decision_version` = OLD.`review_decision_version`
    AND NEW.`review_decision_event_id` IS OLD.`review_decision_event_id`
  )
  OR
  (
    NEW.`review_decision_version` = OLD.`review_decision_version` + 1
    AND length(NEW.`review_decision_event_id`) = 36
    AND NEW.`review_decision_event_id` IS NOT OLD.`review_decision_event_id`
    AND (
      (
        NEW.`review_decision` IS NULL
        AND NEW.`decided_by_user_id` IS NULL
        AND NEW.`decided_at` IS NULL
      )
      OR
      (
        NEW.`review_decision` IN ('accepted','rejected')
        AND NEW.`decided_by_user_id` IS NOT NULL
        AND NEW.`decided_at` IS NOT NULL
        AND NEW.`reviewed_at` IS NOT NULL
      )
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'comparison_change_decision_transition_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `comparison_changes_decision_tenant_guard`
BEFORE UPDATE OF `review_decision`,`decided_by_user_id`,`decided_at`,`review_decision_version`,`review_decision_event_id`
ON `comparison_changes`
WHEN NEW.`review_decision` IS NOT NULL
  AND NEW.`decided_by_user_id` IS NOT NULL
  AND NOT EXISTS (
  SELECT 1 FROM `document_comparisons` comparison
  WHERE comparison.`id` = NEW.`comparison_id`
    AND comparison.`owner_user_id` = NEW.`decided_by_user_id`
    AND comparison.`status` IN ('completed','completed_partial')
    AND comparison.`deleted_at` IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'comparison_change_decision_tenant_mismatch');
END;
