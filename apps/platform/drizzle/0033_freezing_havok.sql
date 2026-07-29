CREATE TABLE `account_deletion_lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`subject_hash` text NOT NULL,
	`subject_key_version` text NOT NULL,
	`event_type` text NOT NULL,
	`deletion_mode` text NOT NULL,
	`policy_version` text NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "account_deletion_lifecycle_event_type_check" CHECK("account_deletion_lifecycle_events"."event_type" IN ('scheduled','cancelled','purge_started','blocked','completed','failed')),
	CONSTRAINT "account_deletion_lifecycle_mode_check" CHECK("account_deletion_lifecycle_events"."deletion_mode" IN ('immediate','recoverable_30d')),
	CONSTRAINT "account_deletion_lifecycle_hash_check" CHECK(length("account_deletion_lifecycle_events"."subject_hash") = 64 AND length("account_deletion_lifecycle_events"."previous_hash") = 64 AND length("account_deletion_lifecycle_events"."event_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_lifecycle_hash_uidx` ON `account_deletion_lifecycle_events` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_lifecycle_chain_uidx` ON `account_deletion_lifecycle_events` (`request_id`,`previous_hash`);--> statement-breakpoint
CREATE INDEX `account_deletion_lifecycle_request_idx` ON `account_deletion_lifecycle_events` (`request_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_deletion_lifecycle_subject_idx` ON `account_deletion_lifecycle_events` (`subject_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `account_deletion_purge_evidence` (
	`request_id` text PRIMARY KEY NOT NULL,
	`subject_hash` text NOT NULL,
	`subject_key_version` text NOT NULL,
	`deletion_mode` text NOT NULL,
	`policy_version` text NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`r2_deleted_count` integer DEFAULT 0 NOT NULL,
	`d1_deleted_count` integer DEFAULT 0 NOT NULL,
	`redacted_count` integer DEFAULT 0 NOT NULL,
	`retained_evidence_json` text DEFAULT '[]' NOT NULL,
	`evidence_hash` text NOT NULL,
	CONSTRAINT "account_deletion_purge_mode_check" CHECK("account_deletion_purge_evidence"."deletion_mode" IN ('immediate','recoverable_30d')),
	CONSTRAINT "account_deletion_purge_counts_check" CHECK("account_deletion_purge_evidence"."r2_deleted_count" >= 0 AND "account_deletion_purge_evidence"."d1_deleted_count" >= 0 AND "account_deletion_purge_evidence"."redacted_count" >= 0),
	CONSTRAINT "account_deletion_purge_hash_check" CHECK(length("account_deletion_purge_evidence"."subject_hash") = 64 AND length("account_deletion_purge_evidence"."evidence_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_purge_hash_uidx` ON `account_deletion_purge_evidence` (`evidence_hash`);--> statement-breakpoint
CREATE INDEX `account_deletion_purge_subject_idx` ON `account_deletion_purge_evidence` (`subject_hash`,`completed_at`);--> statement-breakpoint
DROP INDEX `account_deletion_requests_active_user_uidx`;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `deletion_mode` text DEFAULT 'recoverable_30d' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `subject_hash` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `subject_key_version` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `scheduled_purge_at` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `purge_started_at` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `purge_irreversible_at` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `purge_lease_owner` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `purge_lease_expires_at` text;--> statement-breakpoint
ALTER TABLE `account_deletion_requests` ADD `failure_code` text;--> statement-breakpoint
CREATE INDEX `account_deletion_requests_schedule_idx` ON `account_deletion_requests` (`status`,`scheduled_purge_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_requests_active_user_uidx` ON `account_deletion_requests` (`user_id`) WHERE "account_deletion_requests"."status" IN ('requested','reviewing','scheduled','purging','blocked');--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `lifecycle_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `deletion_completed_at` text;--> statement-breakpoint
UPDATE account_deletion_requests
SET status='blocked',failure_code='LEGACY_REQUEST_REQUIRES_REVIEW'
WHERE status IN ('requested','reviewing');
--> statement-breakpoint
CREATE TRIGGER account_deletion_requests_insert_guard
BEFORE INSERT ON account_deletion_requests
FOR EACH ROW
WHEN NEW.deletion_mode NOT IN ('immediate','recoverable_30d')
  OR NEW.status NOT IN ('requested','reviewing','scheduled','purging','blocked','cancelled','completed','failed')
  OR (
    NEW.status IN ('scheduled','purging','cancelled','completed')
    AND (
      NEW.subject_hash IS NULL
      OR length(NEW.subject_hash)<>64
      OR NEW.subject_hash GLOB '*[^0-9a-f]*'
      OR NEW.subject_key_version IS NULL
      OR length(NEW.subject_key_version) NOT BETWEEN 1 AND 64
      OR NEW.scheduled_purge_at IS NULL
    )
  )
  OR (NEW.status='cancelled' AND (NEW.cancelled_at IS NULL OR NEW.purge_irreversible_at IS NOT NULL))
  OR (NEW.status='completed' AND (NEW.completed_at IS NULL OR NEW.purge_irreversible_at IS NULL))
  OR (NEW.purge_irreversible_at IS NOT NULL AND NEW.status NOT IN ('scheduled','purging','completed','failed'))
  OR (
    NEW.status='purging'
    AND (NEW.purge_started_at IS NULL OR NEW.purge_lease_owner IS NULL OR NEW.purge_lease_expires_at IS NULL)
  )
  OR (NEW.status='blocked' AND NEW.failure_code IS NULL)
BEGIN
  SELECT RAISE(ABORT,'ACCOUNT_DELETION_REQUEST_STATE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_requests_update_guard
BEFORE UPDATE ON account_deletion_requests
FOR EACH ROW
WHEN OLD.status IN ('cancelled','completed')
  OR NOT (NEW.user_id IS OLD.user_id)
  OR NOT (NEW.deletion_mode IS OLD.deletion_mode)
  OR NOT (NEW.subject_hash IS OLD.subject_hash)
  OR NOT (NEW.subject_key_version IS OLD.subject_key_version)
  OR NOT (NEW.requested_at IS OLD.requested_at)
  OR NOT (NEW.scheduled_purge_at IS OLD.scheduled_purge_at)
  OR NEW.deletion_mode NOT IN ('immediate','recoverable_30d')
  OR NEW.status NOT IN ('requested','reviewing','scheduled','purging','blocked','cancelled','completed','failed')
  OR (
    NEW.status IN ('scheduled','purging','cancelled','completed')
    AND (
      NEW.subject_hash IS NULL
      OR length(NEW.subject_hash)<>64
      OR NEW.subject_hash GLOB '*[^0-9a-f]*'
      OR NEW.subject_key_version IS NULL
      OR length(NEW.subject_key_version) NOT BETWEEN 1 AND 64
      OR NEW.scheduled_purge_at IS NULL
    )
  )
  OR (NEW.status='cancelled' AND (NEW.cancelled_at IS NULL OR NEW.purge_irreversible_at IS NOT NULL))
  OR (NEW.status='completed' AND (NEW.completed_at IS NULL OR NEW.purge_irreversible_at IS NULL))
  OR (NEW.purge_irreversible_at IS NOT NULL AND NEW.status NOT IN ('scheduled','purging','completed','failed'))
  OR (
    NEW.status='purging'
    AND (NEW.purge_started_at IS NULL OR NEW.purge_lease_owner IS NULL OR NEW.purge_lease_expires_at IS NULL)
  )
  OR (NEW.status='blocked' AND NEW.failure_code IS NULL)
BEGIN
  SELECT RAISE(ABORT,'ACCOUNT_DELETION_REQUEST_STATE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_lifecycle_events_insert_guard
BEFORE INSERT ON account_deletion_lifecycle_events
FOR EACH ROW
WHEN length(NEW.subject_key_version) NOT BETWEEN 1 AND 64
  OR NEW.subject_hash GLOB '*[^0-9a-f]*'
  OR NEW.previous_hash GLOB '*[^0-9a-f]*'
  OR NEW.event_hash GLOB '*[^0-9a-f]*'
  OR json_valid(NEW.summary_json)<>1
  OR NOT EXISTS (
    SELECT 1 FROM account_deletion_requests request
    WHERE request.id=NEW.request_id
      AND request.subject_hash=NEW.subject_hash
      AND request.subject_key_version=NEW.subject_key_version
      AND request.deletion_mode=NEW.deletion_mode
  )
BEGIN
  SELECT RAISE(ABORT,'ACCOUNT_DELETION_LIFECYCLE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_lifecycle_events_no_update
BEFORE UPDATE ON account_deletion_lifecycle_events
BEGIN
  SELECT RAISE(ABORT,'APPEND_ONLY_ACCOUNT_DELETION_LIFECYCLE');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_lifecycle_events_no_delete
BEFORE DELETE ON account_deletion_lifecycle_events
BEGIN
  SELECT RAISE(ABORT,'APPEND_ONLY_ACCOUNT_DELETION_LIFECYCLE');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_purge_evidence_insert_guard
BEFORE INSERT ON account_deletion_purge_evidence
FOR EACH ROW
WHEN length(NEW.subject_key_version) NOT BETWEEN 1 AND 64
  OR NEW.subject_hash GLOB '*[^0-9a-f]*'
  OR NEW.evidence_hash GLOB '*[^0-9a-f]*'
  OR json_valid(NEW.retained_evidence_json)<>1
  OR NOT EXISTS (
    SELECT 1 FROM account_deletion_requests request
    WHERE request.id=NEW.request_id
      AND request.status='completed'
      AND request.subject_hash=NEW.subject_hash
      AND request.subject_key_version=NEW.subject_key_version
      AND request.deletion_mode=NEW.deletion_mode
      AND request.completed_at=NEW.completed_at
  )
BEGIN
  SELECT RAISE(ABORT,'ACCOUNT_DELETION_PURGE_EVIDENCE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_purge_evidence_no_update
BEFORE UPDATE ON account_deletion_purge_evidence
BEGIN
  SELECT RAISE(ABORT,'APPEND_ONLY_ACCOUNT_DELETION_PURGE_EVIDENCE');
END;
--> statement-breakpoint
CREATE TRIGGER account_deletion_purge_evidence_no_delete
BEFORE DELETE ON account_deletion_purge_evidence
BEGIN
  SELECT RAISE(ABORT,'APPEND_ONLY_ACCOUNT_DELETION_PURGE_EVIDENCE');
END;
--> statement-breakpoint
CREATE TRIGGER user_profiles_lifecycle_insert_guard
BEFORE INSERT ON user_profiles
FOR EACH ROW
WHEN NEW.lifecycle_status<>'active'
  OR NEW.deletion_completed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'USER_PROFILE_LIFECYCLE_INVALID');
END;
--> statement-breakpointCREATE TRIGGER user_profiles_lifecycle_update_guard
BEFORE UPDATE ON user_profiles
FOR EACH ROW
WHEN OLD.lifecycle_status='deleted'
  OR NEW.lifecycle_status NOT IN ('active','deleted')
  OR (NEW.lifecycle_status='active' AND NEW.deletion_completed_at IS NOT NULL)
  OR (
    NEW.lifecycle_status='deleted'
    AND (
      NEW.deletion_completed_at IS NULL
      OR NEW.email NOT LIKE 'deleted.%@invalid.juro'
      OR NEW.email_ciphertext IS NOT NULL
      OR NEW.email_lookup_hash IS NOT NULL
      OR NEW.phone IS NOT NULL
      OR NEW.phone_ciphertext IS NOT NULL
      OR NEW.phone_lookup_hash IS NOT NULL
      OR NEW.full_name IS NOT NULL
      OR NEW.last_name IS NOT NULL
      OR NEW.first_name IS NOT NULL
      OR NEW.middle_name IS NOT NULL
      OR NEW.pinfl IS NOT NULL
      OR NEW.id_document_number IS NOT NULL
      OR NEW.registered_address IS NOT NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT,'USER_PROFILE_LIFECYCLE_INVALID');
END;