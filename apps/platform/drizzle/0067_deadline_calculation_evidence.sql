-- Migration 0067: auditable, user-confirmed deadline calculations for case plans.
-- Expand-only. Existing manually entered due dates remain valid and receive no
-- fabricated calculation evidence.
ALTER TABLE `action_plan_steps` ADD `deadline_source_date` text;--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `deadline_days_count` integer CHECK (`deadline_days_count` IS NULL OR (`deadline_days_count` >= 0 AND `deadline_days_count` <= 3650));--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `deadline_include_source_date` integer DEFAULT 0 NOT NULL CHECK (`deadline_include_source_date` IN (0,1));--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `deadline_roll_rule` text DEFAULT 'none' NOT NULL CHECK (`deadline_roll_rule` IN ('none','next_business_day','previous_business_day'));--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `holiday_calendar_version` text;--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `safe_due_at` text;--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `calculation_method` text;--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `deadline_legal_basis` text;--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `deadline_evidence_json` text;--> statement-breakpoint
ALTER TABLE `action_plan_steps` ADD `deadline_confidence` text DEFAULT 'unverified' NOT NULL CHECK (`deadline_confidence` IN ('unverified','preliminary','source_verified'));--> statement-breakpoint
ALTER TABLE `tasks` ADD `deadline_days_count` integer CHECK (`deadline_days_count` IS NULL OR (`deadline_days_count` >= 0 AND `deadline_days_count` <= 3650));--> statement-breakpoint
ALTER TABLE `tasks` ADD `deadline_include_source_date` integer DEFAULT 0 NOT NULL CHECK (`deadline_include_source_date` IN (0,1));--> statement-breakpoint
ALTER TABLE `tasks` ADD `deadline_roll_rule` text DEFAULT 'none' NOT NULL CHECK (`deadline_roll_rule` IN ('none','next_business_day','previous_business_day'));--> statement-breakpoint
ALTER TABLE `tasks` ADD `holiday_calendar_version` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deadline_evidence_json` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deadline_confidence` text DEFAULT 'unverified' NOT NULL CHECK (`deadline_confidence` IN ('unverified','preliminary','source_verified'));
