CREATE TABLE `platform_staff_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`grant_source` text NOT NULL,
	`granted_by_user_id` text,
	`grant_reason` text NOT NULL,
	`granted_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`revocation_source` text,
	`revoked_by_user_id` text,
	`revocation_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "platform_staff_assignments_role_check" CHECK("platform_staff_assignments"."role" IN ('administrator','support','legal_reviewer')),
	CONSTRAINT "platform_staff_assignments_grant_source_check" CHECK("platform_staff_assignments"."grant_source" IN ('operator_bootstrap','administrator')),
	CONSTRAINT "platform_staff_assignments_grant_actor_check" CHECK((
        ("platform_staff_assignments"."grant_source" = 'operator_bootstrap'
          AND "platform_staff_assignments"."granted_by_user_id" IS NULL)
        OR
        ("platform_staff_assignments"."grant_source" = 'administrator'
          AND "platform_staff_assignments"."granted_by_user_id" IS NOT NULL
          AND "platform_staff_assignments"."granted_by_user_id" <> "platform_staff_assignments"."user_id")
      )),
	CONSTRAINT "platform_staff_assignments_grant_reason_check" CHECK(length(trim("platform_staff_assignments"."grant_reason")) BETWEEN 1 AND 500),
	CONSTRAINT "platform_staff_assignments_time_check" CHECK("platform_staff_assignments"."expires_at" > "platform_staff_assignments"."granted_at"
        AND "platform_staff_assignments"."updated_at" >= "platform_staff_assignments"."created_at"),
	CONSTRAINT "platform_staff_assignments_revocation_check" CHECK((
        "platform_staff_assignments"."revoked_at" IS NULL
        AND "platform_staff_assignments"."revocation_source" IS NULL
        AND "platform_staff_assignments"."revoked_by_user_id" IS NULL
        AND "platform_staff_assignments"."revocation_reason" IS NULL
      ) OR (
        "platform_staff_assignments"."revoked_at" IS NOT NULL
        AND "platform_staff_assignments"."revocation_source" IN ('operator','administrator')
        AND (
          ("platform_staff_assignments"."revocation_source" = 'operator'
            AND "platform_staff_assignments"."revoked_by_user_id" IS NULL)
          OR
          ("platform_staff_assignments"."revocation_source" = 'administrator'
            AND "platform_staff_assignments"."revoked_by_user_id" IS NOT NULL)
        )
        AND length(trim("platform_staff_assignments"."revocation_reason")) BETWEEN 1 AND 500
        AND "platform_staff_assignments"."revoked_at" >= "platform_staff_assignments"."granted_at"
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_staff_assignments_active_uidx` ON `platform_staff_assignments` (`user_id`,`role`) WHERE "platform_staff_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `platform_staff_assignments_user_idx` ON `platform_staff_assignments` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `platform_staff_assignments_role_idx` ON `platform_staff_assignments` (`role`,`expires_at`);--> statement-breakpoint
CREATE TRIGGER `platform_staff_assignments_revoke_only`
BEFORE UPDATE ON `platform_staff_assignments`
WHEN
  OLD.`revoked_at` IS NOT NULL
  OR NEW.`revoked_at` IS NULL
  OR NEW.`id` IS NOT OLD.`id`
  OR NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`role` IS NOT OLD.`role`
  OR NEW.`grant_source` IS NOT OLD.`grant_source`
  OR NEW.`granted_by_user_id` IS NOT OLD.`granted_by_user_id`
  OR NEW.`grant_reason` IS NOT OLD.`grant_reason`
  OR NEW.`granted_at` IS NOT OLD.`granted_at`
  OR NEW.`expires_at` IS NOT OLD.`expires_at`
  OR NEW.`created_at` IS NOT OLD.`created_at`
  OR NEW.`updated_at` <= OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'platform staff assignment is immutable except revocation');
END;--> statement-breakpoint
CREATE TRIGGER `platform_staff_assignments_no_delete`
BEFORE DELETE ON `platform_staff_assignments`
BEGIN
  SELECT RAISE(ABORT, 'platform staff assignments cannot be deleted');
END;
