-- Migration 0150: D1-local, replay-safe first-account product milestones.
-- Raw account identifiers remain in D1 and are never exported to Analytics Engine.
CREATE TABLE `product_account_milestones` (
	`user_id` text NOT NULL,
	`event_name` text NOT NULL,
	`first_completed_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `event_name`),
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `product_account_milestones_event_check` CHECK(
		`event_name` IN ('first_question_sent','clarification_completed','document_analyzed')
	)
);--> statement-breakpoint
CREATE INDEX `product_account_milestones_event_idx`
	ON `product_account_milestones` (`event_name`,`first_completed_at`);
