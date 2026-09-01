-- Migration 0152: lookup indexes for privacy-thresholded product insight cohorts.
-- Raw account and workflow identifiers stay in D1 and are never returned by the KPI API.
CREATE INDEX `product_kpi_milestones_event_completed_idx`
	ON `product_account_milestones` (`event_name`,`first_completed_at`,`user_id`);--> statement-breakpoint
CREATE INDEX `product_kpi_conversations_owner_idx`
	ON `conversations` (`owner_user_id`,`id`);--> statement-breakpoint
CREATE INDEX `product_kpi_action_plans_completion_idx`
	ON `action_plans` (`created_at`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `product_kpi_lawyer_requests_created_idx`
	ON `lawyer_requests` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `product_kpi_ai_feedback_type_created_idx`
	ON `ai_feedback` (`feedback_type`,`created_at`,`assistant_message_id`);
