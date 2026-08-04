-- Migration 0082: versioned provider-cost thresholds, durable circuit state,
-- immutable transition evidence, and identifiers-only operational alert jobs.
CREATE TABLE `ai_cost_guard_policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`provider` text NOT NULL,
	`daily_cost_limit_microusd` integer NOT NULL,
	`rolling_failure_limit` integer NOT NULL,
	`rolling_window_minutes` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`effective_from` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `ai_cost_guard_policy_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_cost_guard_policy_provider_check` CHECK (`provider` IN ('openai','anthropic')),
	CONSTRAINT `ai_cost_guard_policy_cost_check` CHECK (`daily_cost_limit_microusd` BETWEEN 1 AND 1000000000000000),
	CONSTRAINT `ai_cost_guard_policy_failure_check` CHECK (`rolling_failure_limit` BETWEEN 2 AND 100000),
	CONSTRAINT `ai_cost_guard_policy_window_check` CHECK (`rolling_window_minutes` BETWEEN 1 AND 1440),
	CONSTRAINT `ai_cost_guard_policy_enabled_check` CHECK (`enabled` IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_cost_guard_policy_effective_uidx` ON `ai_cost_guard_policy_versions` (`environment`,`provider`,`effective_from`);
--> statement-breakpoint
CREATE INDEX `ai_cost_guard_policy_lookup_idx` ON `ai_cost_guard_policy_versions` (`environment`,`provider`,`effective_from` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_cost_guard_policy_actor_guard`
BEFORE INSERT ON `ai_cost_guard_policy_versions`
WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`created_by_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'AI_COST_GUARD_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_cost_guard_policy_no_update`
BEFORE UPDATE ON `ai_cost_guard_policy_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_COST_GUARD_POLICY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_cost_guard_policy_no_delete`
BEFORE DELETE ON `ai_cost_guard_policy_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_COST_GUARD_POLICY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `ai_provider_circuit_states` (
	`environment` text NOT NULL,
	`provider` text NOT NULL,
	`state` text DEFAULT 'closed' NOT NULL,
	`reason` text,
	`current_event_id` text,
	`observed_value` integer,
	`threshold_value` integer,
	`opened_at` text,
	`closed_at` text,
	`updated_by_user_id` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY (`environment`,`provider`),
	CONSTRAINT `ai_provider_circuit_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_provider_circuit_provider_check` CHECK (`provider` IN ('openai','anthropic')),
	CONSTRAINT `ai_provider_circuit_state_check` CHECK (`state` IN ('open','closed')),
	CONSTRAINT `ai_provider_circuit_reason_check` CHECK (`reason` IS NULL OR `reason` IN ('manual','daily_cost_limit','failure_spike')),
	CONSTRAINT `ai_provider_circuit_values_check` CHECK ((`observed_value` IS NULL AND `threshold_value` IS NULL) OR (`observed_value` >= 0 AND `threshold_value` > 0)),
	CONSTRAINT `ai_provider_circuit_evidence_check` CHECK ((`state`='open' AND `reason` IS NOT NULL AND `current_event_id` IS NOT NULL AND `opened_at` IS NOT NULL AND `closed_at` IS NULL) OR (`state`='closed' AND `reason` IS NULL AND `opened_at` IS NULL AND `closed_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_provider_circuit_event_uidx` ON `ai_provider_circuit_states` (`current_event_id`);
--> statement-breakpoint
CREATE INDEX `ai_provider_circuit_state_idx` ON `ai_provider_circuit_states` (`environment`,`state`,`provider`);
--> statement-breakpoint
CREATE TABLE `ai_cost_control_events` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`provider` text NOT NULL,
	`transition` text NOT NULL,
	`reason` text NOT NULL,
	`observed_value` integer,
	`threshold_value` integer,
	`actor_user_id` text,
	`created_at` text NOT NULL,
	CONSTRAINT `ai_cost_control_event_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_cost_control_event_provider_check` CHECK (`provider` IN ('openai','anthropic')),
	CONSTRAINT `ai_cost_control_event_transition_check` CHECK (`transition` IN ('opened','closed')),
	CONSTRAINT `ai_cost_control_event_reason_check` CHECK (`reason` IN ('manual','daily_cost_limit','failure_spike')),
	CONSTRAINT `ai_cost_control_event_values_check` CHECK ((`observed_value` IS NULL AND `threshold_value` IS NULL) OR (`observed_value` >= 0 AND `threshold_value` > 0))
);
--> statement-breakpoint
CREATE INDEX `ai_cost_control_events_timeline_idx` ON `ai_cost_control_events` (`environment`,`created_at` DESC,`provider`);
--> statement-breakpoint
CREATE TRIGGER `ai_cost_control_event_actor_guard`
BEFORE INSERT ON `ai_cost_control_events`
WHEN NEW.`actor_user_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`actor_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'AI_COST_CONTROL_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_cost_control_events_no_update`
BEFORE UPDATE ON `ai_cost_control_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_COST_CONTROL_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_cost_control_events_no_delete`
BEFORE DELETE ON `ai_cost_control_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_COST_CONTROL_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `operational_alert_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`cost_control_event_id` text NOT NULL,
	`environment` text NOT NULL,
	`provider` text NOT NULL,
	`alert_type` text NOT NULL,
	`severity` text NOT NULL,
	`reason` text NOT NULL,
	`observed_value` integer,
	`threshold_value` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cost_control_event_id`) REFERENCES `ai_cost_control_events`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `operational_alert_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `operational_alert_provider_check` CHECK (`provider` IN ('openai','anthropic')),
	CONSTRAINT `operational_alert_type_check` CHECK (`alert_type`='ai_provider_circuit_opened'),
	CONSTRAINT `operational_alert_severity_check` CHECK (`severity`='critical'),
	CONSTRAINT `operational_alert_reason_check` CHECK (`reason` IN ('manual','daily_cost_limit','failure_spike')),
	CONSTRAINT `operational_alert_values_check` CHECK ((`observed_value` IS NULL AND `threshold_value` IS NULL) OR (`observed_value` >= 0 AND `threshold_value` > 0)),
	CONSTRAINT `operational_alert_status_check` CHECK (`status` IN ('pending','sending','retrying','sent','failed')),
	CONSTRAINT `operational_alert_attempts_check` CHECK (`attempt_count` >= 0),
	CONSTRAINT `operational_alert_evidence_check` CHECK ((`status` IN ('pending','sending') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NULL) OR (`status` IN ('retrying','failed') AND `provider_message_id` IS NULL AND `sent_at` IS NULL AND `error_code` IS NOT NULL) OR (`status`='sent' AND `provider_message_id` IS NOT NULL AND `sent_at` IS NOT NULL AND `error_code` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_alert_event_uidx` ON `operational_alert_jobs` (`cost_control_event_id`,`alert_type`);
--> statement-breakpoint
CREATE INDEX `operational_alert_status_idx` ON `operational_alert_jobs` (`status`,`updated_at`);
