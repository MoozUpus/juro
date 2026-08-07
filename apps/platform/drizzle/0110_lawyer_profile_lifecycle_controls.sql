-- Migration 0110: append-only, fail-closed suspension, block, archive and restore controls.
-- This is additive. It never deletes a profile, its moderation history, or a
-- pre-existing request; it only prevents new marketplace visibility and work.
CREATE TABLE `lawyer_profile_lifecycle_events` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `from_profile_revision` integer NOT NULL,
  `to_profile_revision` integer NOT NULL,
  `actor_user_id` text NOT NULL,
  `action` text NOT NULL,
  `reason` text NOT NULL,
  `from_profile_status` text NOT NULL,
  `to_profile_status` text NOT NULL,
  `from_marketplace_status` text NOT NULL,
  `to_marketplace_status` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `lawyer_profile_lifecycle_action_check` CHECK (`action` IN ('suspend','block','archive','restore')),
  CONSTRAINT `lawyer_profile_lifecycle_reason_check` CHECK (length(trim(`reason`)) BETWEEN 1 AND 2000),
  CONSTRAINT `lawyer_profile_lifecycle_revision_check` CHECK (
    (`action`='restore' AND `to_profile_revision`=`from_profile_revision`+1)
    OR (`action`<>'restore' AND `to_profile_revision`=`from_profile_revision`)
  )
);
--> statement-breakpoint
CREATE INDEX `lawyer_profile_lifecycle_profile_idx`
ON `lawyer_profile_lifecycle_events` (`lawyer_profile_id`,`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `lawyer_profile_lifecycle_actor_idx`
ON `lawyer_profile_lifecycle_events` (`actor_user_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_lifecycle_events_append_only_update`
BEFORE UPDATE ON `lawyer_profile_lifecycle_events`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile lifecycle events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_lifecycle_events_append_only_delete`
BEFORE DELETE ON `lawyer_profile_lifecycle_events`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile lifecycle events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_lifecycle_event_state_guard`
BEFORE INSERT ON `lawyer_profile_lifecycle_events`
WHEN NOT EXISTS (
  SELECT 1
  FROM `lawyer_profiles` p
  WHERE p.`id`=NEW.`lawyer_profile_id`
    AND p.`profile_revision`=NEW.`from_profile_revision`
    AND p.`status`=NEW.`from_profile_status`
    AND p.`marketplace_status`=NEW.`from_marketplace_status`
)
OR (
  NEW.`action`='restore'
  AND (
    NEW.`from_marketplace_status` NOT IN ('suspended','blocked','archived')
    OR NEW.`to_profile_status`<>'pending'
    OR NEW.`to_marketplace_status` NOT IN ('profile_incomplete','pending_review')
  )
)
OR (
  NEW.`action`='suspend'
  AND (
    NEW.`from_marketplace_status` IN ('suspended','blocked','archived')
    OR NEW.`to_profile_status`<>'pending'
    OR NEW.`to_marketplace_status`<>'suspended'
  )
)
OR (
  NEW.`action`='block'
  AND (
    NEW.`from_marketplace_status` IN ('suspended','blocked','archived')
    OR NEW.`to_profile_status`<>'pending'
    OR NEW.`to_marketplace_status`<>'blocked'
  )
)
OR (
  NEW.`action`='archive'
  AND (
    NEW.`from_marketplace_status` IN ('suspended','blocked','archived')
    OR NEW.`to_profile_status`<>'pending'
    OR NEW.`to_marketplace_status`<>'archived'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile lifecycle event state invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profiles_restricted_marketplace_requires_lifecycle_event`
BEFORE UPDATE OF `status`,`marketplace_status`,`profile_revision`,`public_approved_at` ON `lawyer_profiles`
WHEN (
  NEW.`marketplace_status` IN ('suspended','blocked','archived')
  OR (
    OLD.`marketplace_status` IN ('suspended','blocked','archived')
    AND (
      NEW.`marketplace_status`<>OLD.`marketplace_status`
      OR NEW.`status`<>OLD.`status`
      OR NEW.`profile_revision`<>OLD.`profile_revision`
    )
  )
)
AND NOT EXISTS (
  SELECT 1
  FROM `lawyer_profile_lifecycle_events` e
  WHERE e.`lawyer_profile_id`=NEW.`id`
    AND e.`from_profile_revision`=OLD.`profile_revision`
    AND e.`to_profile_revision`=NEW.`profile_revision`
    AND e.`from_profile_status`=OLD.`status`
    AND e.`to_profile_status`=NEW.`status`
    AND e.`from_marketplace_status`=OLD.`marketplace_status`
    AND e.`to_marketplace_status`=NEW.`marketplace_status`
)
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile lifecycle evidence required');
END;
