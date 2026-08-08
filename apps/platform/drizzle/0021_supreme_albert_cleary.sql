CREATE TABLE `platform_staff_role_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`actor_assignment_id` text NOT NULL,
	`subject_user_id` text NOT NULL,
	`subject_assignment_id` text NOT NULL,
	`event_type` text NOT NULL,
	`capability` text NOT NULL,
	`role` text NOT NULL,
	`reason` text NOT NULL,
	`actor_mfa_verified_at` text NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "platform_staff_role_events_type_check" CHECK("platform_staff_role_events"."event_type" IN ('staff.role.granted','staff.role.revoked')),
	CONSTRAINT "platform_staff_role_events_capability_check" CHECK("platform_staff_role_events"."capability" = 'staff.roles.manage'),
	CONSTRAINT "platform_staff_role_events_role_check" CHECK("platform_staff_role_events"."role" IN ('administrator','support','legal_reviewer')),
	CONSTRAINT "platform_staff_role_events_reason_check" CHECK(length(trim("platform_staff_role_events"."reason")) BETWEEN 1 AND 500),
	CONSTRAINT "platform_staff_role_events_hash_check" CHECK(length("platform_staff_role_events"."previous_hash") = 64
        AND length("platform_staff_role_events"."event_hash") = 64),
	CONSTRAINT "platform_staff_role_events_mfa_time_check" CHECK("platform_staff_role_events"."actor_mfa_verified_at" <= "platform_staff_role_events"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_staff_role_events_hash_uidx` ON `platform_staff_role_events` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_staff_role_events_chain_uidx` ON `platform_staff_role_events` (`actor_user_id`,`previous_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_staff_role_events_assignment_type_uidx` ON `platform_staff_role_events` (`subject_assignment_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `platform_staff_role_events_actor_idx` ON `platform_staff_role_events` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `platform_staff_role_events_subject_idx` ON `platform_staff_role_events` (`subject_user_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `platform_staff_role_events_chain_guard`
BEFORE INSERT ON `platform_staff_role_events`
WHEN (
  NOT EXISTS (
    SELECT 1 FROM `platform_staff_role_events`
    WHERE actor_user_id = NEW.actor_user_id
  )
  AND NEW.previous_hash <> '0000000000000000000000000000000000000000000000000000000000000000'
)
OR (
  EXISTS (
    SELECT 1 FROM `platform_staff_role_events`
    WHERE actor_user_id = NEW.actor_user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `platform_staff_role_events` parent
    WHERE parent.actor_user_id = NEW.actor_user_id
      AND parent.event_hash = NEW.previous_hash
      AND NOT EXISTS (
        SELECT 1
        FROM `platform_staff_role_events` child
        WHERE child.actor_user_id = parent.actor_user_id
          AND child.previous_hash = parent.event_hash
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'platform staff role event chain predecessor mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `platform_staff_role_events_consistency`
BEFORE INSERT ON `platform_staff_role_events`
WHEN NOT EXISTS (
  SELECT 1
  FROM `auth_sessions` s
  JOIN `platform_staff_assignments` actor
    ON actor.id = NEW.actor_assignment_id
   AND actor.user_id = NEW.actor_user_id
  LEFT JOIN `auth_devices` d ON d.id = s.device_id
  WHERE s.id = NEW.actor_session_id
    AND s.user_id = NEW.actor_user_id
    AND s.revoked_at IS NULL
    AND s.assurance_level = 'mfa'
    AND s.mfa_verified_at = NEW.actor_mfa_verified_at
    AND s.mfa_verified_at <= NEW.created_at
    AND unixepoch(NEW.created_at) - unixepoch(s.mfa_verified_at)
      BETWEEN 0 AND 300
    AND s.expires_at > NEW.created_at
    AND coalesce(s.idle_expires_at, s.expires_at) > NEW.created_at
    AND (
      s.device_id IS NULL
      OR (d.id IS NOT NULL AND d.revoked_at IS NULL)
    )
    AND actor.role = 'administrator'
    AND actor.granted_at <= NEW.created_at
    AND actor.expires_at > NEW.created_at
    AND (
      actor.revoked_at IS NULL
      OR actor.revoked_at >= NEW.created_at
    )
    AND EXISTS (
      SELECT 1
      FROM `auth_totp_credentials` t
      WHERE t.user_id = NEW.actor_user_id
        AND t.status = 'active'
        AND t.verified_at IS NOT NULL
        AND t.verified_at <= NEW.actor_mfa_verified_at
        AND t.disabled_at IS NULL
    )
)
OR NOT EXISTS (
  SELECT 1
  FROM `platform_staff_assignments` subject
  WHERE subject.id = NEW.subject_assignment_id
    AND subject.user_id = NEW.subject_user_id
    AND subject.role = NEW.role
    AND subject.granted_at <= NEW.created_at
    AND subject.expires_at > NEW.created_at
    AND (
      (
        NEW.event_type = 'staff.role.granted'
        AND subject.grant_source = 'administrator'
        AND subject.granted_by_user_id = NEW.actor_user_id
        AND subject.grant_reason = NEW.reason
        AND subject.granted_at = NEW.created_at
        AND subject.created_at = NEW.created_at
        AND subject.updated_at = NEW.created_at
        AND subject.revoked_at IS NULL
      )
      OR
      (
        NEW.event_type = 'staff.role.revoked'
        AND subject.revocation_source = 'administrator'
        AND subject.revoked_by_user_id = NEW.actor_user_id
        AND subject.revocation_reason = NEW.reason
        AND subject.revoked_at = NEW.created_at
        AND subject.updated_at = NEW.created_at
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'platform staff role event evidence mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `platform_staff_role_events_no_update`
BEFORE UPDATE ON `platform_staff_role_events`
BEGIN
  SELECT RAISE(ABORT, 'platform staff role events are append-only');
END;--> statement-breakpoint
CREATE TRIGGER `platform_staff_role_events_no_delete`
BEFORE DELETE ON `platform_staff_role_events`
BEGIN
  SELECT RAISE(ABORT, 'platform staff role events are append-only');
END;
