-- The dedicated legal database begins with environment and migration control
-- only. Canonical legal bodies and sparse postings never belong in this D1.
CREATE TABLE `legal_target_control` (
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
    CHECK (`evidence_bucket_name`='juro-legal-evidence-'||`environment`),
  CONSTRAINT `legal_target_control_schema_check`
    CHECK (`schema_version`=1),
  CONSTRAINT `legal_target_control_timestamp_check`
    CHECK (`initialized_at` GLOB '????-??-??T??:??:??*Z'
      AND `updated_at` GLOB '????-??-??T??:??:??*Z')
);
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
