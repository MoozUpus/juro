-- Migration 0104: replace D1-incompatible exact lifecycle hash GLOB checks.
-- This rebuild keeps the append-only case ledger, all foreign keys, indexes and
-- projection guards intact while using a simple fixed-length hexadecimal check
-- that Cloudflare D1 accepts during INSERT.
DROP TRIGGER IF EXISTS `case_lifecycle_events_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `case_lifecycle_events_no_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `case_lifecycle_apply_projection`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `case_lifecycle_insert_guard`;--> statement-breakpoint
CREATE TABLE `case_lifecycle_events__0104` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`from_archived_at` text,
	`to_archived_at` text,
	`unresolved_task_count` integer NOT NULL,
	`unresolved_plan_step_count` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`lifecycle_revision` integer NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `case_lifecycle_action_check` CHECK (`action` IN ('complete','reopen','archive','restore')),
	CONSTRAINT `case_lifecycle_counts_check` CHECK (`unresolved_task_count`>=0 AND `unresolved_plan_step_count`>=0),
	CONSTRAINT `case_lifecycle_revision_check` CHECK (`lifecycle_revision`>0),
	CONSTRAINT `case_lifecycle_idempotency_check` CHECK (length(`idempotency_key`) BETWEEN 8 AND 180),
	CONSTRAINT `case_lifecycle_hash_check` CHECK (
		length(`previous_hash`)=64 AND `previous_hash` NOT GLOB '*[^0-9a-f]*'
		AND length(`event_hash`)=64 AND `event_hash` NOT GLOB '*[^0-9a-f]*'
	)
);--> statement-breakpoint
INSERT INTO `case_lifecycle_events__0104` SELECT * FROM `case_lifecycle_events`;--> statement-breakpoint
DROP TABLE `case_lifecycle_events`;--> statement-breakpoint
ALTER TABLE `case_lifecycle_events__0104` RENAME TO `case_lifecycle_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `case_lifecycle_event_hash_uidx` ON `case_lifecycle_events` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `case_lifecycle_idempotency_uidx` ON `case_lifecycle_events` (`case_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `case_lifecycle_revision_uidx` ON `case_lifecycle_events` (`case_id`,`lifecycle_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `case_lifecycle_chain_uidx` ON `case_lifecycle_events` (`case_id`,`previous_hash`);--> statement-breakpoint
CREATE INDEX `case_lifecycle_workspace_created_idx` ON `case_lifecycle_events` (`workspace_id`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `case_lifecycle_insert_guard`
BEFORE INSERT ON `case_lifecycle_events`
WHEN
	NOT EXISTS (
		SELECT 1 FROM `cases` AS c
		JOIN `workspace_members` AS member
		  ON member.`workspace_id`=c.`workspace_id`
		 AND member.`user_id`=NEW.`actor_user_id`
		 AND member.`status`='active'
		WHERE c.`id`=NEW.`case_id`
		  AND c.`workspace_id`=NEW.`workspace_id`
		  AND c.`status`=NEW.`from_status`
		  AND coalesce(c.`archived_at`,'')=coalesce(NEW.`from_archived_at`,'')
		  AND NEW.`lifecycle_revision`=c.`lifecycle_revision`+1
	)
	OR NEW.`unresolved_task_count`<>(
		SELECT count(*) FROM `tasks`
		WHERE `case_id`=NEW.`case_id` AND `status` NOT IN ('completed','cancelled')
	)
	OR NEW.`unresolved_plan_step_count`<>(
		SELECT count(*) FROM `action_plan_steps` AS step
		JOIN `action_plans` AS plan ON plan.`id`=step.`plan_id`
		WHERE plan.`case_id`=NEW.`case_id` AND step.`status` NOT IN ('completed','cancelled')
	)
	OR (
		NEW.`lifecycle_revision`=1
		AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000'
	)
	OR (
		NEW.`lifecycle_revision`>1
		AND NOT EXISTS (
			SELECT 1 FROM `case_lifecycle_events` AS parent
			WHERE parent.`case_id`=NEW.`case_id`
			  AND parent.`lifecycle_revision`=NEW.`lifecycle_revision`-1
			  AND parent.`event_hash`=NEW.`previous_hash`
		)
	)
	OR NOT (
		(NEW.`action`='complete' AND NEW.`from_status` NOT IN ('completed','archived')
		 AND NEW.`from_archived_at` IS NULL AND NEW.`to_status`='completed' AND NEW.`to_archived_at` IS NULL)
		OR (NEW.`action`='reopen' AND NEW.`from_status`='completed'
		 AND NEW.`from_archived_at` IS NULL AND NEW.`to_status`='open' AND NEW.`to_archived_at` IS NULL)
		OR (NEW.`action`='archive' AND NEW.`from_status`='completed'
		 AND NEW.`from_archived_at` IS NULL AND NEW.`to_status`='archived' AND NEW.`to_archived_at`=NEW.`created_at`)
		OR (NEW.`action`='restore' AND NEW.`from_status`='archived'
		 AND NEW.`from_archived_at` IS NOT NULL AND NEW.`to_status`='completed' AND NEW.`to_archived_at` IS NULL)
	)
BEGIN
	SELECT RAISE(ABORT, 'CASE_LIFECYCLE_CONFLICT');
END;--> statement-breakpoint
CREATE TRIGGER `case_lifecycle_apply_projection`
AFTER INSERT ON `case_lifecycle_events`
BEGIN
	UPDATE `cases`
	SET `status`=NEW.`to_status`,
		`archived_at`=NEW.`to_archived_at`,
		`completed_at`=CASE
			WHEN NEW.`action`='complete' THEN NEW.`created_at`
			WHEN NEW.`action`='reopen' THEN NULL
			ELSE `completed_at`
		END,
		`completed_by_user_id`=CASE
			WHEN NEW.`action`='complete' THEN NEW.`actor_user_id`
			WHEN NEW.`action`='reopen' THEN NULL
			ELSE `completed_by_user_id`
		END,
		`archived_by_user_id`=CASE WHEN NEW.`action`='archive' THEN NEW.`actor_user_id` ELSE NULL END,
		`lifecycle_revision`=NEW.`lifecycle_revision`,
		`current_revision`=`current_revision`+1,
		`updated_at`=NEW.`created_at`
	WHERE `id`=NEW.`case_id` AND `workspace_id`=NEW.`workspace_id`;
END;--> statement-breakpoint
CREATE TRIGGER `case_lifecycle_events_no_update`
BEFORE UPDATE ON `case_lifecycle_events`
BEGIN
	SELECT RAISE(ABORT, 'CASE_LIFECYCLE_EVENT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `case_lifecycle_events_no_delete`
BEFORE DELETE ON `case_lifecycle_events`
BEGIN
	SELECT RAISE(ABORT, 'CASE_LIFECYCLE_EVENT_IMMUTABLE');
END;
