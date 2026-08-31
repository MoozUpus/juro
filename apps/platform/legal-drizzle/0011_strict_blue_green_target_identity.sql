-- Re-apply the strict suffix grammar for candidates that received migration
-- 0010 before its SQL check was aligned with the runtime validator.
DROP TRIGGER `legal_target_control_identity_guard`;
--> statement-breakpoint
DROP TRIGGER `legal_target_control_no_delete`;
--> statement-breakpoint
CREATE TABLE `legal_target_control_next` (
  `control_key` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `migration_state` text DEFAULT 'initialized' NOT NULL,
  `evidence_bucket_name` text NOT NULL,
  `schema_version` integer DEFAULT 1 NOT NULL,
  `initialized_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `legal_target_control_key_check`
    CHECK (`control_key`='environment'),
  CONSTRAINT `legal_target_control_environment_check`
    CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_target_control_state_check`
    CHECK (`migration_state` IN ('initialized','migrating','ready','blocked')),
  CONSTRAINT `legal_target_control_bucket_check`
    CHECK (
      `evidence_bucket_name`='juro-legal-evidence-'||`environment`
      OR (
        `evidence_bucket_name` GLOB 'juro-legal-evidence-'||`environment`||'-[a-z0-9]*'
        AND `evidence_bucket_name` NOT GLOB '*[^a-z0-9-]*'
        AND `evidence_bucket_name` NOT GLOB '*--*'
        AND substr(`evidence_bucket_name`,-1,1)<>'-'
      )
    ),
  CONSTRAINT `legal_target_control_schema_check` CHECK (`schema_version`=1),
  CONSTRAINT `legal_target_control_timestamp_check`
    CHECK (`initialized_at` GLOB '????-??-??T??:??:??*Z'
      AND `updated_at` GLOB '????-??-??T??:??:??*Z')
);
--> statement-breakpoint
INSERT INTO `legal_target_control_next`
  (`control_key`,`environment`,`migration_state`,`evidence_bucket_name`,
    `schema_version`,`initialized_at`,`updated_at`)
SELECT `control_key`,`environment`,`migration_state`,`evidence_bucket_name`,
  `schema_version`,`initialized_at`,`updated_at`
FROM `legal_target_control`;
--> statement-breakpoint
DROP TABLE `legal_target_control`;
--> statement-breakpoint
ALTER TABLE `legal_target_control_next` RENAME TO `legal_target_control`;
--> statement-breakpoint
CREATE TRIGGER `legal_target_control_identity_guard`
BEFORE UPDATE ON `legal_target_control`
WHEN NEW.`control_key`<>OLD.`control_key`
  OR NEW.`environment`<>OLD.`environment`
  OR NEW.`evidence_bucket_name`<>OLD.`evidence_bucket_name`
  OR NEW.`schema_version`<>OLD.`schema_version`
  OR NEW.`initialized_at`<>OLD.`initialized_at`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TARGET_CONTROL_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_target_control_no_delete`
BEFORE DELETE ON `legal_target_control`
BEGIN SELECT RAISE(ABORT, 'LEGAL_TARGET_CONTROL_IMMUTABLE'); END;
