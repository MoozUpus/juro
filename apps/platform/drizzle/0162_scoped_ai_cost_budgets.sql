-- Migration 0162: operator-defined per-user and per-feature AI spend budgets,
-- durable daily/monthly threshold evidence and identifiers-only alerts.
CREATE TABLE `ai_scope_budget_policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`daily_cost_limit_microusd` integer NOT NULL,
	`monthly_cost_limit_microusd` integer NOT NULL,
	`action` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`effective_from` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `ai_scope_budget_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_scope_budget_type_check` CHECK (`scope_type` IN ('user','feature')),
	CONSTRAINT `ai_scope_budget_key_check` CHECK (length(`scope_key`) BETWEEN 1 AND 120 AND `scope_key` NOT GLOB '*[^A-Za-z0-9._:-]*'),
	CONSTRAINT `ai_scope_budget_daily_check` CHECK (`daily_cost_limit_microusd` BETWEEN 1 AND 1000000000000000),
	CONSTRAINT `ai_scope_budget_monthly_check` CHECK (`monthly_cost_limit_microusd` BETWEEN `daily_cost_limit_microusd` AND 1000000000000000),
	CONSTRAINT `ai_scope_budget_action_check` CHECK (`action` IN ('alert_only','disable_deep','block_calls')),
	CONSTRAINT `ai_scope_budget_enabled_check` CHECK (`enabled` IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_scope_budget_policy_effective_uidx`
ON `ai_scope_budget_policy_versions` (`environment`,`scope_type`,`scope_key`,`effective_from`);
--> statement-breakpoint
CREATE INDEX `ai_scope_budget_policy_lookup_idx`
ON `ai_scope_budget_policy_versions` (`environment`,`scope_type`,`scope_key`,`effective_from` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_scope_budget_policy_actor_guard`
BEFORE INSERT ON `ai_scope_budget_policy_versions`
WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`created_by_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'AI_SCOPE_BUDGET_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_scope_budget_policy_user_guard`
BEFORE INSERT ON `ai_scope_budget_policy_versions`
WHEN NEW.`scope_type`='user' AND NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`scope_key`)
BEGIN
	SELECT RAISE(ABORT, 'AI_SCOPE_BUDGET_USER_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_scope_budget_policy_no_update`
BEFORE UPDATE ON `ai_scope_budget_policy_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_SCOPE_BUDGET_POLICY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_scope_budget_policy_no_delete`
BEFORE DELETE ON `ai_scope_budget_policy_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_SCOPE_BUDGET_POLICY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `ai_scope_budget_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`environment` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`period_type` text NOT NULL,
	`period_key` text NOT NULL,
	`reason` text NOT NULL,
	`action` text NOT NULL,
	`observed_value` integer NOT NULL,
	`threshold_value` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `ai_scope_budget_policy_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ai_scope_budget_event_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_scope_budget_event_type_check` CHECK (`scope_type` IN ('user','feature')),
	CONSTRAINT `ai_scope_budget_event_period_check` CHECK (`period_type` IN ('daily','monthly')),
	CONSTRAINT `ai_scope_budget_event_period_key_check` CHECK ((`period_type`='daily' AND length(`period_key`)=10) OR (`period_type`='monthly' AND length(`period_key`)=7)),
	CONSTRAINT `ai_scope_budget_event_reason_check` CHECK (`reason` IN ('cost_limit','unpriced_usage')),
	CONSTRAINT `ai_scope_budget_event_action_check` CHECK (`action` IN ('alert_only','disable_deep','block_calls')),
	CONSTRAINT `ai_scope_budget_event_observed_check` CHECK (`observed_value`>=0),
	CONSTRAINT `ai_scope_budget_event_threshold_check` CHECK ((`reason`='cost_limit' AND `threshold_value`>0) OR (`reason`='unpriced_usage' AND `threshold_value` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_scope_budget_event_period_uidx`
ON `ai_scope_budget_events` (`policy_id`,`period_type`,`period_key`,`reason`);
--> statement-breakpoint
CREATE INDEX `ai_scope_budget_event_timeline_idx`
ON `ai_scope_budget_events` (`environment`,`created_at` DESC,`scope_type`,`scope_key`);
--> statement-breakpoint
CREATE TRIGGER `ai_scope_budget_events_no_update`
BEFORE UPDATE ON `ai_scope_budget_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_SCOPE_BUDGET_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_scope_budget_events_no_delete`
BEFORE DELETE ON `ai_scope_budget_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_SCOPE_BUDGET_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `ai_scope_budget_alert_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_event_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`environment` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`period_type` text NOT NULL,
	`period_key` text NOT NULL,
	`reason` text NOT NULL,
	`action` text NOT NULL,
	`observed_value` integer NOT NULL,
	`threshold_value` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`budget_event_id`) REFERENCES `ai_scope_budget_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_id`) REFERENCES `ai_scope_budget_policy_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ai_scope_budget_alert_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_scope_budget_alert_type_check` CHECK (`scope_type` IN ('user','feature')),
	CONSTRAINT `ai_scope_budget_alert_period_check` CHECK (`period_type` IN ('daily','monthly')),
	CONSTRAINT `ai_scope_budget_alert_reason_check` CHECK (`reason` IN ('cost_limit','unpriced_usage')),
	CONSTRAINT `ai_scope_budget_alert_action_check` CHECK (`action` IN ('alert_only','disable_deep','block_calls')),
	CONSTRAINT `ai_scope_budget_alert_status_check` CHECK (`status` IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT `ai_scope_budget_alert_attempts_check` CHECK (`attempt_count`>=0),
	CONSTRAINT `ai_scope_budget_alert_evidence_check` CHECK ((`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NULL) OR (`status` IN ('retrying','failed') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NOT NULL) OR (`status`='sent' AND `provider_message_id` IS NOT NULL AND `sent_at` IS NOT NULL AND `error_code` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_scope_budget_alert_event_uidx`
ON `ai_scope_budget_alert_jobs` (`budget_event_id`);
--> statement-breakpoint
CREATE INDEX `ai_scope_budget_alert_status_idx`
ON `ai_scope_budget_alert_jobs` (`status`,`updated_at`);
