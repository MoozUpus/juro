-- Migration 0081: append-only provider usage, versioned prices, and daily cost aggregates.
-- No prompt, answer, document text, filename, email, or other user content is stored here.
CREATE TABLE `ai_model_price_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`operation` text NOT NULL,
	`input_microusd_per_million_tokens` integer NOT NULL,
	`output_microusd_per_million_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_microusd_per_million_tokens` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`effective_from` text NOT NULL,
	`source_url` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `ai_model_price_versions_provider_check` CHECK (`provider` IN ('openai','anthropic')),
	CONSTRAINT `ai_model_price_versions_model_check` CHECK (length(trim(`model`)) BETWEEN 1 AND 120),
	CONSTRAINT `ai_model_price_versions_operation_check` CHECK (length(trim(`operation`)) BETWEEN 1 AND 64),
	CONSTRAINT `ai_model_price_versions_amount_check` CHECK (
		`input_microusd_per_million_tokens` BETWEEN 0 AND 1000000000000
		AND `output_microusd_per_million_tokens` BETWEEN 0 AND 1000000000000
		AND `cached_input_microusd_per_million_tokens` BETWEEN 0 AND 1000000000000
	),
	CONSTRAINT `ai_model_price_versions_currency_check` CHECK (`currency` = 'USD'),
	CONSTRAINT `ai_model_price_versions_source_check` CHECK (`source_url` IS NULL OR length(`source_url`) BETWEEN 8 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_model_price_versions_effective_uidx` ON `ai_model_price_versions` (`provider`,`model`,`operation`,`effective_from`);
--> statement-breakpoint
CREATE INDEX `ai_model_price_versions_lookup_idx` ON `ai_model_price_versions` (`provider`,`model`,`operation`,`effective_from` DESC);
--> statement-breakpoint
CREATE TRIGGER `ai_model_price_versions_actor_guard`
BEFORE INSERT ON `ai_model_price_versions`
WHEN NOT EXISTS (SELECT 1 FROM `user_profiles` WHERE `id`=NEW.`created_by_user_id`)
BEGIN
	SELECT RAISE(ABORT, 'AI_MODEL_PRICE_ACTOR_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_model_price_versions_no_update`
BEFORE UPDATE ON `ai_model_price_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_MODEL_PRICE_VERSION_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_model_price_versions_no_delete`
BEFORE DELETE ON `ai_model_price_versions`
BEGIN
	SELECT RAISE(ABORT, 'AI_MODEL_PRICE_VERSION_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `ai_provider_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`usage_day` text NOT NULL,
	`workspace_id` text,
	`user_id` text,
	`feature` text NOT NULL,
	`operation` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`provider_request_id` text,
	`request_count` integer DEFAULT 1 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`dimensions` integer,
	`status` text NOT NULL,
	`error_code` text,
	`price_version_id` text,
	`estimated_cost_microusd` integer,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`price_version_id`) REFERENCES `ai_model_price_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ai_provider_usage_events_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_provider_usage_events_scope_check` CHECK ((`workspace_id` IS NULL AND `user_id` IS NULL) OR (`workspace_id` IS NOT NULL AND `user_id` IS NOT NULL)),
	CONSTRAINT `ai_provider_usage_events_feature_check` CHECK (length(trim(`feature`)) BETWEEN 1 AND 64),
	CONSTRAINT `ai_provider_usage_events_operation_check` CHECK (length(trim(`operation`)) BETWEEN 1 AND 64),
	CONSTRAINT `ai_provider_usage_events_provider_check` CHECK (`provider` IN ('openai','anthropic')),
	CONSTRAINT `ai_provider_usage_events_model_check` CHECK (length(trim(`model`)) BETWEEN 1 AND 120),
	CONSTRAINT `ai_provider_usage_events_request_check` CHECK (`request_count` = 1),
	CONSTRAINT `ai_provider_usage_events_token_check` CHECK (`input_tokens` >= 0 AND `output_tokens` >= 0 AND `cached_input_tokens` >= 0),
	CONSTRAINT `ai_provider_usage_events_item_check` CHECK (`item_count` >= 0 AND (`dimensions` IS NULL OR `dimensions` > 0)),
	CONSTRAINT `ai_provider_usage_events_status_check` CHECK (`status` IN ('succeeded','failed')),
	CONSTRAINT `ai_provider_usage_events_error_check` CHECK ((`status`='succeeded' AND `error_code` IS NULL) OR (`status`='failed' AND length(trim(`error_code`)) BETWEEN 1 AND 100)),
	CONSTRAINT `ai_provider_usage_events_cost_check` CHECK (`estimated_cost_microusd` IS NULL OR `estimated_cost_microusd` >= 0)
);
--> statement-breakpoint
CREATE INDEX `ai_provider_usage_events_daily_idx` ON `ai_provider_usage_events` (`environment`,`usage_day`,`provider`,`feature`);
--> statement-breakpoint
CREATE INDEX `ai_provider_usage_events_tenant_idx` ON `ai_provider_usage_events` (`workspace_id`,`user_id`,`usage_day`,`feature`);
--> statement-breakpoint
CREATE INDEX `ai_provider_usage_events_unpriced_idx` ON `ai_provider_usage_events` (`environment`,`provider`,`model`,`operation`,`created_at`) WHERE `status`='succeeded' AND `price_version_id` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `ai_provider_usage_events_no_update`
BEFORE UPDATE ON `ai_provider_usage_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_PROVIDER_USAGE_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_provider_usage_events_no_delete`
BEFORE DELETE ON `ai_provider_usage_events`
BEGIN
	SELECT RAISE(ABORT, 'AI_PROVIDER_USAGE_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TABLE `ai_cost_daily_aggregates` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`usage_day` text NOT NULL,
	`scope_key` text NOT NULL,
	`workspace_id` text,
	`user_id` text,
	`feature` text NOT NULL,
	`operation` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`failed_request_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_microusd` integer DEFAULT 0 NOT NULL,
	`unpriced_request_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `ai_cost_daily_aggregates_environment_check` CHECK (`environment` IN ('development','staging','production')),
	CONSTRAINT `ai_cost_daily_aggregates_scope_check` CHECK ((`workspace_id` IS NULL AND `user_id` IS NULL AND `scope_key`='system') OR (`workspace_id` IS NOT NULL AND `user_id` IS NOT NULL AND `scope_key`=`workspace_id` || ':' || `user_id`)),
	CONSTRAINT `ai_cost_daily_aggregates_count_check` CHECK (`request_count` >= 0 AND `failed_request_count` >= 0 AND `failed_request_count` <= `request_count` AND `unpriced_request_count` >= 0 AND `unpriced_request_count` <= `request_count`),
	CONSTRAINT `ai_cost_daily_aggregates_token_check` CHECK (`input_tokens` >= 0 AND `output_tokens` >= 0 AND `cached_input_tokens` >= 0 AND `estimated_cost_microusd` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_cost_daily_aggregates_scope_uidx` ON `ai_cost_daily_aggregates` (`environment`,`usage_day`,`scope_key`,`feature`,`operation`,`provider`,`model`);
--> statement-breakpoint
CREATE INDEX `ai_cost_daily_aggregates_day_idx` ON `ai_cost_daily_aggregates` (`environment`,`usage_day`,`provider`,`feature`);
