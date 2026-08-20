-- MFA-bound operational controls for the legal corpus. This journal contains
-- only technical identifiers and safe operator reasons; legal text, user
-- documents, credentials, and secrets are deliberately excluded.
CREATE TABLE `legal_corpus_admin_events` (
  `id` text PRIMARY KEY NOT NULL,
  `environment` text NOT NULL,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text,
  `reason` text NOT NULL,
  `details_json` text NOT NULL DEFAULT '{}',
  `actor_user_id` text NOT NULL,
  `actor_session_id` text NOT NULL,
  `actor_assignment_id` text NOT NULL,
  `actor_mfa_verified_at` text NOT NULL,
  `previous_event_hash` text,
  `event_hash` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `legal_corpus_admin_environment_check` CHECK (`environment` IN ('development','staging','production')),
  CONSTRAINT `legal_corpus_admin_action_check` CHECK (`action` IN ('discovery_seeded','discovery_retried','ingestion_retried')),
  CONSTRAINT `legal_corpus_admin_target_type_check` CHECK (`target_type` IN ('catalog','checkpoint','ingestion_job')),
  CONSTRAINT `legal_corpus_admin_reason_check` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
  CONSTRAINT `legal_corpus_admin_details_check` CHECK (json_valid(`details_json`) AND length(`details_json`)<=4096),
  CONSTRAINT `legal_corpus_admin_hash_check` CHECK (
    length(`event_hash`)=64 AND `event_hash` NOT GLOB '*[^0-9A-F]*'
    AND (`previous_event_hash` IS NULL OR (length(`previous_event_hash`)=64 AND `previous_event_hash` NOT GLOB '*[^0-9A-F]*'))
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_admin_event_hash_uidx` ON `legal_corpus_admin_events` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_corpus_admin_chain_uidx` ON `legal_corpus_admin_events` (`environment`,ifnull(`previous_event_hash`,'ROOT'));
--> statement-breakpoint
CREATE INDEX `legal_corpus_admin_events_recent_idx` ON `legal_corpus_admin_events` (`environment`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_admin_events_immutable_guard` BEFORE UPDATE ON `legal_corpus_admin_events`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_ADMIN_EVENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_corpus_admin_events_no_delete` BEFORE DELETE ON `legal_corpus_admin_events`
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_ADMIN_EVENT_IMMUTABLE'); END;
