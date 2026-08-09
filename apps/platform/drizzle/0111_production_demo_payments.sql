-- Connected payment demonstrations for staging and production. These records
-- are deliberately isolated from subscriptions, entitlements, real payments,
-- settlement allocations and lawyer payables.
CREATE TABLE `demo_payment_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `external_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `flow_type` text NOT NULL,
  `provider` text DEFAULT 'demo' NOT NULL,
  `is_simulation` integer DEFAULT 1 NOT NULL,
  `amount_minor` integer NOT NULL,
  `currency` text DEFAULT 'UZS' NOT NULL,
  `installment_count` integer,
  `status` text DEFAULT 'previewed' NOT NULL,
  `idempotency_key` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `demo_payment_runs_flow_check` CHECK(`flow_type` IN ('subscription','lawyer_service','uzum_installment')),
  CONSTRAINT `demo_payment_runs_provider_check` CHECK(`provider` = 'demo'),
  CONSTRAINT `demo_payment_runs_simulation_check` CHECK(`is_simulation` = 1),
  CONSTRAINT `demo_payment_runs_amount_check` CHECK(`amount_minor` > 0 AND `amount_minor` <= 100000000000),
  CONSTRAINT `demo_payment_runs_currency_check` CHECK(`currency` = 'UZS'),
  CONSTRAINT `demo_payment_runs_installment_check` CHECK(
    (`flow_type` = 'uzum_installment' AND `installment_count` IN (3,6,12))
    OR (`flow_type` != 'uzum_installment' AND `installment_count` IS NULL)
  ),
  CONSTRAINT `demo_payment_runs_status_check` CHECK(`status` IN ('previewed','succeeded','failed','cancelled','refunded','paid_out'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `demo_payment_runs_external_uidx` ON `demo_payment_runs` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `demo_payment_runs_workspace_idempotency_uidx` ON `demo_payment_runs` (`workspace_id`,`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `demo_payment_runs_workspace_created_idx` ON `demo_payment_runs` (`workspace_id`,`user_id`,`created_at`);--> statement-breakpoint

CREATE TABLE `demo_payment_events` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `ordinal` integer NOT NULL,
  `action` text NOT NULL,
  `previous_status` text,
  `status` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `demo_payment_runs`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `demo_payment_events_action_check` CHECK(`action` IN ('created','succeed','fail','cancel','refund','payout')),
  CONSTRAINT `demo_payment_events_status_check` CHECK(`status` IN ('previewed','succeeded','failed','cancelled','refunded','paid_out'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `demo_payment_events_run_ordinal_uidx` ON `demo_payment_events` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `demo_payment_events_run_created_idx` ON `demo_payment_events` (`run_id`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `demo_payment_runs_identity_immutable`
BEFORE UPDATE OF `external_id`,`workspace_id`,`user_id`,`flow_type`,`provider`,`is_simulation`,`amount_minor`,`currency`,`installment_count`,`idempotency_key`,`created_at`
ON `demo_payment_runs`
BEGIN
  SELECT RAISE(ABORT, 'DEMO_PAYMENT_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `demo_payment_runs_no_delete`
BEFORE DELETE ON `demo_payment_runs`
BEGIN
  SELECT RAISE(ABORT, 'DEMO_PAYMENT_RUN_APPEND_ONLY');
END;--> statement-breakpoint
CREATE TRIGGER `demo_payment_events_immutable_update`
BEFORE UPDATE ON `demo_payment_events`
BEGIN
  SELECT RAISE(ABORT, 'DEMO_PAYMENT_EVENT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `demo_payment_events_immutable_delete`
BEFORE DELETE ON `demo_payment_events`
BEGIN
  SELECT RAISE(ABORT, 'DEMO_PAYMENT_EVENT_IMMUTABLE');
END;
