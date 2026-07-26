CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `name` text NOT NULL,
  `locale` text DEFAULT 'ru' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workspaces_type_idx` ON `workspaces` (`type`,`created_at`);
--> statement-breakpoint

ALTER TABLE `user_profiles` ADD `default_workspace_id` text REFERENCES `workspaces`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `workspace_members` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `joined_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_uidx` ON `workspace_members` (`workspace_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`,`status`);
--> statement-breakpoint

CREATE TABLE `workspace_invitations` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `invited_by_user_id` text NOT NULL,
  `email_hash` text NOT NULL,
  `token_hash` text NOT NULL,
  `role` text NOT NULL,
  `expires_at` text NOT NULL,
  `accepted_at` text,
  `revoked_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade,
  FOREIGN KEY (`invited_by_user_id`) REFERENCES `user_profiles`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_token_uidx` ON `workspace_invitations` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `workspace_invitations_workspace_idx` ON `workspace_invitations` (`workspace_id`,`expires_at`);
--> statement-breakpoint

CREATE TABLE `workspace_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `actor_user_id` text,
  `entity_type` text NOT NULL,
  `entity_id` text,
  `action` text NOT NULL,
  `metadata_json` text,
  `ip_hash` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workspace_audit_events_workspace_idx` ON `workspace_audit_events` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `workspace_audit_events_entity_idx` ON `workspace_audit_events` (`entity_type`,`entity_id`);
--> statement-breakpoint

CREATE TABLE `consents` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `workspace_id` text,
  `type` text NOT NULL,
  `version` text NOT NULL,
  `scope_json` text,
  `granted_at` text NOT NULL,
  `revoked_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consents_user_idx` ON `consents` (`user_id`,`type`,`granted_at`);
--> statement-breakpoint
CREATE INDEX `consents_workspace_idx` ON `consents` (`workspace_id`,`type`);
--> statement-breakpoint

INSERT INTO `workspaces` (`id`,`type`,`name`,`locale`,`created_at`,`updated_at`)
SELECT
  'ws_' || replace(`id`, '-', ''),
  CASE WHEN `account_type` = 'business' THEN 'business' ELSE 'individual' END,
  coalesce(nullif(`company_name`, ''), nullif(`full_name`, ''), `email`, 'JURO'),
  CASE WHEN `locale` = 'uz' THEN 'uz' ELSE 'ru' END,
  `created_at`,
  `updated_at`
FROM `user_profiles`
WHERE `default_workspace_id` IS NULL;
--> statement-breakpoint

INSERT INTO `workspace_members` (`id`,`workspace_id`,`user_id`,`role`,`status`,`joined_at`,`created_at`,`updated_at`)
SELECT
  'wm_' || replace(`id`, '-', ''),
  'ws_' || replace(`id`, '-', ''),
  `id`,
  'owner',
  'active',
  `created_at`,
  `created_at`,
  `updated_at`
FROM `user_profiles`
WHERE `default_workspace_id` IS NULL;
--> statement-breakpoint

UPDATE `user_profiles`
SET `default_workspace_id` = 'ws_' || replace(`id`, '-', '')
WHERE `default_workspace_id` IS NULL;
