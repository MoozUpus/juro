CREATE TABLE `legal_source_fetch_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`source_kind` text NOT NULL,
	`locale` text NOT NULL,
	`requested_url` text NOT NULL,
	`canonical_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`requested_by_user_id` text,
	`source_id` text,
	`version_id` text,
	`error_code` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_fetch_requests_idempotency_uidx` ON `legal_source_fetch_requests` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `legal_source_fetch_requests_status_idx` ON `legal_source_fetch_requests` (`environment`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `legal_source_fetch_requests_source_idx` ON `legal_source_fetch_requests` (`source_id`,`version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_review_queue_version_reason_uidx` ON `legal_review_queue` (`version_id`,`reason_code`);--> statement-breakpoint
CREATE TRIGGER `legal_source_fetch_requests_insert_guard`
BEFORE INSERT ON `legal_source_fetch_requests`
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.`environment` NOT IN ('development','staging','production') OR
         NEW.`source_kind` NOT IN ('lex','advice') OR
         NEW.`locale` NOT IN ('ru','uz') OR
         NEW.`status` NOT IN ('queued','running','retrying','completed','failed','cancelled') OR
         NEW.`attempt_count` < 0
    THEN RAISE(ABORT, 'legal source fetch request scope invalid')
  END;
  SELECT CASE
    WHEN instr(NEW.`requested_url`, '?') > 0 OR instr(NEW.`requested_url`, '#') > 0 OR
         (NEW.`source_kind` = 'lex' AND (
           substr(NEW.`requested_url`, 1, length('https://lex.uz/' || NEW.`locale` || '/docs/-')) <>
             'https://lex.uz/' || NEW.`locale` || '/docs/-' OR
           length(substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/-') + 1)) = 0 OR
           substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/-') + 1) GLOB '*[^0-9]*'
         )) OR
         (NEW.`source_kind` = 'advice' AND (
           substr(NEW.`requested_url`, 1, length('https://advice.uz/' || NEW.`locale` || '/questions/')) <>
             'https://advice.uz/' || NEW.`locale` || '/questions/' OR
           length(substr(NEW.`requested_url`, length('https://advice.uz/' || NEW.`locale` || '/questions/') + 1)) = 0 OR
           substr(NEW.`requested_url`, length('https://advice.uz/' || NEW.`locale` || '/questions/') + 1) GLOB '*[^0-9]*'
         ))
    THEN RAISE(ABORT, 'legal source fetch request URL invalid')
  END;
  SELECT CASE
    WHEN (NEW.`source_id` IS NULL) <> (NEW.`version_id` IS NULL) OR
         (NEW.`status` = 'queued' AND (
           NEW.`attempt_count` <> 0 OR NEW.`started_at` IS NOT NULL OR
           NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NOT NULL
         )) OR
         (NEW.`status` = 'running' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NOT NULL
         )) OR
         (NEW.`status` = 'retrying' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NULL
         )) OR
         (NEW.`status` = 'completed' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NULL OR NEW.`source_id` IS NULL OR
           NEW.`version_id` IS NULL OR NEW.`error_code` IS NOT NULL
         )) OR
         (NEW.`status` = 'failed' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NULL
         )) OR
         (NEW.`status` = 'cancelled' AND NEW.`finished_at` IS NULL)
    THEN RAISE(ABORT, 'legal source fetch request lifecycle invalid')
  END;
END;--> statement-breakpoint
CREATE TRIGGER `legal_source_fetch_requests_update_guard`
BEFORE UPDATE ON `legal_source_fetch_requests`
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.`environment` <> OLD.`environment` OR
         NEW.`source_kind` <> OLD.`source_kind` OR
         NEW.`locale` <> OLD.`locale` OR
         NEW.`requested_url` <> OLD.`requested_url` OR
         NEW.`canonical_id` <> OLD.`canonical_id` OR
         NEW.`idempotency_key` <> OLD.`idempotency_key`
    THEN RAISE(ABORT, 'legal source fetch request identity is immutable')
  END;
  SELECT CASE
    WHEN NEW.`status` NOT IN ('queued','running','retrying','completed','failed','cancelled') OR
         NEW.`attempt_count` < OLD.`attempt_count` OR
         (NEW.`source_id` IS NULL) <> (NEW.`version_id` IS NULL) OR
         (OLD.`status` = 'queued' AND NEW.`status` NOT IN ('queued','running','cancelled')) OR
         (OLD.`status` = 'running' AND NEW.`status` NOT IN ('running','retrying','completed','failed','cancelled')) OR
         (OLD.`status` = 'retrying' AND NEW.`status` NOT IN ('retrying','running','failed','cancelled')) OR
         (OLD.`status` IN ('completed','failed','cancelled') AND NEW.`status` <> OLD.`status`) OR
         (NEW.`status` = 'queued' AND (
           NEW.`attempt_count` <> 0 OR NEW.`started_at` IS NOT NULL OR
           NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NOT NULL
         )) OR
         (NEW.`status` = 'running' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NOT NULL
         )) OR
         (NEW.`status` = 'retrying' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NULL
         )) OR
         (NEW.`status` = 'completed' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NULL OR NEW.`source_id` IS NULL OR
           NEW.`version_id` IS NULL OR NEW.`error_code` IS NOT NULL
         )) OR
         (NEW.`status` = 'failed' AND (
           NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
           NEW.`finished_at` IS NULL OR NEW.`source_id` IS NOT NULL OR
           NEW.`error_code` IS NULL
         )) OR
         (NEW.`status` = 'cancelled' AND NEW.`finished_at` IS NULL)
    THEN RAISE(ABORT, 'legal source fetch request lifecycle invalid')
  END;
  SELECT CASE
    WHEN OLD.`status` = 'completed' AND (
      NEW.`status` <> OLD.`status` OR
      NEW.`source_id` <> OLD.`source_id` OR
      NEW.`version_id` <> OLD.`version_id` OR
      NEW.`finished_at` <> OLD.`finished_at`
    )
    THEN RAISE(ABORT, 'completed legal source fetch request is immutable')
  END;
END;
