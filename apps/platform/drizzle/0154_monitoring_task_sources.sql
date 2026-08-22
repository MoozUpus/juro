CREATE TABLE `monitoring_task_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `case_id` text NOT NULL,
  `change_event_id` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `official_url` text NOT NULL,
  `source_title` text NOT NULL,
  `source_identifier` text,
  `source_detected_at` text NOT NULL,
  `source_last_checked_at` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`change_event_id`) REFERENCES `legal_monitoring_change_events`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (length(trim(`source_title`)) BETWEEN 1 AND 1000),
  CHECK (json_valid(`snapshot_json`) = 1),
  CHECK (
    substr(`official_url`,1,length('https://lex.uz/'))='https://lex.uz/' OR
    substr(`official_url`,1,length('https://www.lex.uz/'))='https://www.lex.uz/'
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_task_sources_task_uidx`
  ON `monitoring_task_sources` (`task_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_task_sources_case_event_actor_uidx`
  ON `monitoring_task_sources` (`case_id`,`change_event_id`,`created_by_user_id`);
--> statement-breakpoint
CREATE INDEX `monitoring_task_sources_event_idx`
  ON `monitoring_task_sources` (`change_event_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `monitoring_task_sources_insert_guard`
BEFORE INSERT ON `monitoring_task_sources`
BEGIN
  SELECT RAISE(ABORT,'MONITORING_TASK_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM `tasks` t
    WHERE t.`id`=NEW.`task_id`
      AND t.`workspace_id`=NEW.`workspace_id`
      AND t.`case_id`=NEW.`case_id`
      AND t.`owner_user_id`=NEW.`created_by_user_id`
      AND t.`plan_step_id` IS NULL
  );
  SELECT RAISE(ABORT,'MONITORING_TASK_SOURCE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1
    FROM `legal_monitoring_change_events` e
    JOIN `legal_monitoring_metadata` m ON m.`id`=e.`metadata_id`
    WHERE e.`id`=NEW.`change_event_id`
      AND e.`canonical_url`=NEW.`official_url`
      AND e.`detected_at`=NEW.`source_detected_at`
      AND m.`act_title`=NEW.`source_title`
      AND m.`canonical_id` IS NEW.`source_identifier`
      AND m.`last_checked_at`=NEW.`source_last_checked_at`
      AND m.`http_status` BETWEEN 200 AND 299
      AND m.`last_error_code` IS NULL
  );
  SELECT RAISE(ABORT,'MONITORING_TASK_SNAPSHOT_INVALID')
  WHERE json_extract(NEW.`snapshot_json`,'$.schemaVersion')<>1
     OR json_extract(NEW.`snapshot_json`,'$.evidenceKind')<>'lex_metadata_monitor'
     OR json_extract(NEW.`snapshot_json`,'$.changeEventId')<>NEW.`change_event_id`
     OR json_extract(NEW.`snapshot_json`,'$.officialUrl')<>NEW.`official_url`
     OR json_extract(NEW.`snapshot_json`,'$.sourceTitle')<>NEW.`source_title`
     OR json_extract(NEW.`snapshot_json`,'$.detectedAt')<>NEW.`source_detected_at`
     OR json_extract(NEW.`snapshot_json`,'$.sourceLastCheckedAt')<>NEW.`source_last_checked_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `monitoring_task_sources_no_update`
BEFORE UPDATE ON `monitoring_task_sources`
BEGIN
  SELECT RAISE(ABORT,'MONITORING_TASK_SOURCE_IMMUTABLE');
END;
