-- Migration 0151: replay-safe D1-local value activation and KPI lookup indexes.
-- Account and run identifiers remain in D1 and are never returned by the KPI API.
CREATE TABLE `product_value_activations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ai_run_id` text NOT NULL,
	`first_completed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `product_value_activations_run_uidx`
	ON `product_value_activations` (`ai_run_id`);--> statement-breakpoint
CREATE INDEX `product_value_activations_completed_idx`
	ON `product_value_activations` (`first_completed_at`);--> statement-breakpoint
CREATE INDEX `product_kpi_user_profiles_created_idx`
	ON `user_profiles` (`created_at`,`account_type`);--> statement-breakpoint
CREATE INDEX `product_kpi_ai_runs_completed_idx`
	ON `ai_runs` (`status`,`completed_at`,`response_message_id`);--> statement-breakpoint
CREATE INDEX `product_kpi_provider_usage_completed_idx`
	ON `ai_provider_usage_events` (`environment`,`feature`,`status`,`completed_at`);--> statement-breakpoint
CREATE INDEX `product_kpi_cases_owner_created_idx`
	ON `cases` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_kpi_action_plans_creator_created_idx`
	ON `action_plans` (`created_by_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_kpi_lawyer_requests_requester_created_idx`
	ON `lawyer_requests` (`requester_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_kpi_consultations_client_created_idx`
	ON `lawyer_consultations` (`client_user_id`,`created_at`);
