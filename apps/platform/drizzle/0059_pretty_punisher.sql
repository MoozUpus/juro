ALTER TABLE `lawyer_profiles` ADD COLUMN `profile_revision` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE `lawyer_profile_moderation` (
  `id` text PRIMARY KEY NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `profile_revision` integer NOT NULL,
  `moderator_user_id` text NOT NULL,
  `decision` text NOT NULL,
  `reason` text NOT NULL,
  `profile_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`moderator_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_profile_moderation_revision_uidx` ON `lawyer_profile_moderation` (`lawyer_profile_id`,`profile_revision`);
--> statement-breakpoint
CREATE INDEX `lawyer_profile_moderation_moderator_idx` ON `lawyer_profile_moderation` (`moderator_user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_moderation_applies_profile_status`
AFTER INSERT ON `lawyer_profile_moderation`
WHEN NEW.`decision` IN ('approved','rejected')
BEGIN
  UPDATE `lawyer_profiles`
  SET `status`=CASE WHEN NEW.`decision`='approved' THEN 'public_approved' ELSE 'rejected' END,
      `public_approved_at`=CASE WHEN NEW.`decision`='approved' THEN NEW.`created_at` ELSE NULL END,
      `updated_at`=NEW.`created_at`
  WHERE `id`=NEW.`lawyer_profile_id`
    AND `profile_revision`=NEW.`profile_revision`
    AND `status`='pending';
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profiles_status_requires_moderation`
BEFORE UPDATE OF `status`,`public_approved_at` ON `lawyer_profiles`
WHEN (NEW.`status` IN ('public_approved','rejected') OR NEW.`public_approved_at` IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM `lawyer_profile_moderation` m
    WHERE m.`lawyer_profile_id`=NEW.`id`
      AND m.`profile_revision`=NEW.`profile_revision`
      AND ((NEW.`status`='public_approved' AND m.`decision`='approved') OR (NEW.`status`='rejected' AND m.`decision`='rejected'))
  )
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile moderation evidence required');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_moderation_append_only_update`
BEFORE UPDATE ON `lawyer_profile_moderation`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile moderation is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profile_moderation_append_only_delete`
BEFORE DELETE ON `lawyer_profile_moderation`
BEGIN
  SELECT RAISE(ABORT, 'lawyer profile moderation is append-only');
END;
