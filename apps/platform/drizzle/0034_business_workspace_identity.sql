ALTER TABLE `workspaces` ADD `full_name` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `short_name` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `created_by_user_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `creation_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_creation_request_uidx` ON `workspaces` (`creation_request_id`) WHERE "workspaces"."creation_request_id" IS NOT NULL;
--> statement-breakpoint
UPDATE `workspaces`
SET `full_name`=CASE
      WHEN length(trim(`name`)) >= 2 THEN substr(trim(`name`),1,200)
      ELSE 'Business'
    END,
    `short_name`=CASE
      WHEN length(trim(`name`)) >= 2 THEN substr(trim(`name`),1,80)
      ELSE 'Business'
    END
WHERE `type`='business'
  AND (`full_name` IS NULL OR `short_name` IS NULL);
--> statement-breakpoint
CREATE TRIGGER `workspaces_business_identity_insert_guard`
BEFORE INSERT ON `workspaces`
WHEN NEW.`type`='business' AND (
  NEW.`full_name` IS NULL OR length(trim(NEW.`full_name`)) < 2
  OR length(NEW.`full_name`) > 200
  OR NEW.`short_name` IS NULL OR length(trim(NEW.`short_name`)) < 2
  OR length(NEW.`short_name`) > 80
)
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_BUSINESS_IDENTITY_REQUIRED');
END;
--> statement-breakpoint
CREATE TRIGGER `workspaces_business_identity_update_guard`
BEFORE UPDATE OF `type`,`full_name`,`short_name` ON `workspaces`
WHEN NEW.`type`='business' AND (
  NEW.`full_name` IS NULL OR length(trim(NEW.`full_name`)) < 2
  OR length(NEW.`full_name`) > 200
  OR NEW.`short_name` IS NULL OR length(trim(NEW.`short_name`)) < 2
  OR length(NEW.`short_name`) > 80
)
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_BUSINESS_IDENTITY_REQUIRED');
END;