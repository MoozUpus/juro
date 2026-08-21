ALTER TABLE `lawyer_profiles`
  ADD COLUMN `publication_consent_at` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles`
  ADD COLUMN `accepting_new_requests` integer DEFAULT 1 NOT NULL
  CHECK (`accepting_new_requests` IN (0,1));
--> statement-breakpoint
DROP TRIGGER IF EXISTS `lawyer_profiles_status_requires_moderation`;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profiles_status_requires_moderation`
BEFORE UPDATE OF `status`,`public_approved_at` ON `lawyer_profiles`
WHEN (NEW.`status` IN ('public_approved','rejected') OR NEW.`public_approved_at` IS NOT NULL)
  AND NOT (
    NEW.`status`='public_approved'
    AND NEW.`marketplace_status`='public_approved'
    AND NEW.`publication_consent_at` IS NOT NULL
    AND NEW.`publication_consent_at`=NEW.`public_approved_at`
    AND NEW.`user_id`=OLD.`user_id`
  )
  AND NOT EXISTS (
    SELECT 1 FROM `lawyer_profile_moderation` m
    WHERE m.`lawyer_profile_id`=NEW.`id`
      AND m.`profile_revision`=NEW.`profile_revision`
      AND ((NEW.`status`='public_approved' AND m.`decision`='approved') OR (NEW.`status`='rejected' AND m.`decision`='rejected'))
  )
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile moderation or publication consent evidence required');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_profile_publication_events` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `profile_revision` integer NOT NULL,
  `previous_profile_status` text NOT NULL,
  `previous_marketplace_status` text NOT NULL,
  `publication_consent_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`profile_revision` > 0),
  CHECK (`publication_consent_at`=`created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_profile_publication_events_revision_uidx`
  ON `lawyer_profile_publication_events` (`lawyer_profile_id`,`profile_revision`);
--> statement-breakpoint
CREATE INDEX `lawyer_profile_publication_events_actor_idx`
  ON `lawyer_profile_publication_events` (`actor_user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_publication_events_no_update`
BEFORE UPDATE ON `lawyer_profile_publication_events`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile publication events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_publication_events_no_delete`
BEFORE DELETE ON `lawyer_profile_publication_events`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile publication events are append-only');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_trials` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `post_expiry_mode` text DEFAULT 'stay_published' NOT NULL,
  `reminder_30_sent_at` text,
  `reminder_7_sent_at` text,
  `reminder_1_sent_at` text,
  `reminder_expired_sent_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`starts_at` < `ends_at`),
  CHECK (`status` IN ('active','extended','converted','disabled')),
  CHECK (`post_expiry_mode` IN ('stay_published','limit_new_requests','hide_profile'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_trials_profile_uidx`
  ON `lawyer_trials` (`lawyer_profile_id`);
--> statement-breakpoint
CREATE INDEX `lawyer_trials_expiry_idx`
  ON `lawyer_trials` (`status`,`ends_at`);
--> statement-breakpoint
INSERT INTO `lawyer_trials` (
  `id`,`lawyer_profile_id`,`starts_at`,`ends_at`,`status`,`post_expiry_mode`,`created_at`,`updated_at`
)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
  `id`,COALESCE(`public_approved_at`,`updated_at`),
  strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(`public_approved_at`,`updated_at`),'+90 days'),
  'active','stay_published',COALESCE(`public_approved_at`,`updated_at`),`updated_at`
FROM `lawyer_profiles`
WHERE `status`='public_approved' AND `marketplace_status`='public_approved';
--> statement-breakpoint
UPDATE `lawyer_profiles`
SET `publication_consent_at`=COALESCE(`public_approved_at`,`updated_at`)
WHERE `status`='public_approved' AND `marketplace_status`='public_approved';
--> statement-breakpoint
CREATE TABLE `lawyer_profile_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `previous_revision` integer NOT NULL,
  `next_revision` integer NOT NULL,
  `actor_user_id` text NOT NULL,
  `previous_snapshot_json` text NOT NULL,
  `next_snapshot_json` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`next_revision` = `previous_revision` + 1),
  CHECK (length(trim(`reason`)) BETWEEN 3 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_profile_revisions_version_uidx`
  ON `lawyer_profile_revisions` (`lawyer_profile_id`,`next_revision`);
--> statement-breakpoint
CREATE INDEX `lawyer_profile_revisions_created_idx`
  ON `lawyer_profile_revisions` (`lawyer_profile_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_revisions_no_update`
BEFORE UPDATE ON `lawyer_profile_revisions`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_revisions_no_delete`
BEFORE DELETE ON `lawyer_profile_revisions`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile revisions are append-only');
END;
--> statement-breakpoint
CREATE TABLE `lawyer_profile_deletion_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `requested_by_user_id` text NOT NULL,
  `status` text DEFAULT 'requested' NOT NULL,
  `reason` text,
  `decision_reason` text,
  `reviewed_by_user_id` text,
  `requested_at` text NOT NULL,
  `reviewed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`requested_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`status` IN ('requested','approved','rejected','cancelled')),
  CHECK ((`status`='requested' AND `reviewed_at` IS NULL AND `reviewed_by_user_id` IS NULL)
    OR (`status`='cancelled' AND `reviewed_at` IS NULL AND `reviewed_by_user_id` IS NULL)
    OR (`status` IN ('approved','rejected') AND `reviewed_at` IS NOT NULL AND `reviewed_by_user_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_profile_deletion_requests_open_uidx`
  ON `lawyer_profile_deletion_requests` (`lawyer_profile_id`)
  WHERE `status`='requested';
--> statement-breakpoint
CREATE INDEX `lawyer_profile_deletion_requests_status_idx`
  ON `lawyer_profile_deletion_requests` (`status`,`requested_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_deletion_requests_identity_guard`
BEFORE UPDATE ON `lawyer_profile_deletion_requests`
WHEN NEW.`id`<>OLD.`id`
  OR NEW.`lawyer_profile_id`<>OLD.`lawyer_profile_id`
  OR NEW.`requested_by_user_id`<>OLD.`requested_by_user_id`
  OR NEW.`requested_at`<>OLD.`requested_at`
  OR NEW.`created_at`<>OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile deletion request identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_deletion_requests_terminal_guard`
BEFORE UPDATE ON `lawyer_profile_deletion_requests`
WHEN OLD.`status` IN ('approved','rejected','cancelled')
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile deletion request is terminal');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_deletion_requests_no_delete`
BEFORE DELETE ON `lawyer_profile_deletion_requests`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile deletion requests are append-only');
END;
