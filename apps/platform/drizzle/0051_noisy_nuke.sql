CREATE TABLE `action_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_by_user_id` text,
	`reason` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `action_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_plan_versions_plan_version_uidx` ON `action_plan_versions` (`plan_id`,`version`);--> statement-breakpoint
CREATE INDEX `action_plan_versions_plan_created_idx` ON `action_plan_versions` (`plan_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER action_plan_versions_no_update
BEFORE UPDATE ON action_plan_versions
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'action plan versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER action_plan_versions_no_delete
BEFORE DELETE ON action_plan_versions
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM action_plans WHERE id = OLD.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'action plan versions are immutable');
END;