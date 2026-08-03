CREATE TABLE `entitlement_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`entitlement_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text,
	`quantity` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`consumed_at` text,
	`released_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entitlement_id`) REFERENCES `subscription_entitlements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entitlement_usage_quantity_check" CHECK("entitlement_usage"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlement_usage_workspace_idempotency_uidx` ON `entitlement_usage` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `entitlement_usage_entitlement_status_idx` ON `entitlement_usage` (`entitlement_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `ledger_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`code` text NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "ledger_accounts_currency_check" CHECK("ledger_accounts"."currency" = 'UZS')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_accounts_owner_code_uidx` ON `ledger_accounts` (`owner_type`,`owner_id`,`code`,`currency`);--> statement-breakpoint
CREATE INDEX `ledger_accounts_code_idx` ON `ledger_accounts` (`code`,`status`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`side` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`memo` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `ledger_transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `ledger_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_entries_side_check" CHECK("ledger_entries"."side" IN ('DEBIT','CREDIT')),
	CONSTRAINT "ledger_entries_amount_check" CHECK("ledger_entries"."amount_minor" > 0),
	CONSTRAINT "ledger_entries_currency_check" CHECK("ledger_entries"."currency" = 'UZS')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_transaction_sequence_uidx` ON `ledger_entries` (`transaction_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `ledger_entries_account_idx` ON `ledger_entries` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ledger_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`order_id` text,
	`payment_id` text,
	`transaction_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`idempotency_key` text NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`debit_total_minor` integer DEFAULT 0 NOT NULL,
	`credit_total_minor` integer DEFAULT 0 NOT NULL,
	`occurred_at` text NOT NULL,
	`posted_at` text,
	`failed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_transactions_totals_check" CHECK("ledger_transactions"."debit_total_minor" >= 0 AND "ledger_transactions"."credit_total_minor" >= 0),
	CONSTRAINT "ledger_transactions_posted_balance_check" CHECK("ledger_transactions"."status" != 'posted' OR "ledger_transactions"."debit_total_minor" = "ledger_transactions"."credit_total_minor")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transactions_external_uidx` ON `ledger_transactions` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transactions_workspace_idempotency_uidx` ON `ledger_transactions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ledger_transactions_order_idx` ON `ledger_transactions` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketplace_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`customer_user_id` text NOT NULL,
	`order_type` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`total_amount_minor` integer DEFAULT 0 NOT NULL,
	`accepted_pricing_snapshot_id` text,
	`idempotency_key` text NOT NULL,
	`provider` text,
	`provider_status` text,
	`version` integer DEFAULT 1 NOT NULL,
	`expires_at` text,
	`settled_at` text,
	`failed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "marketplace_orders_amount_check" CHECK("marketplace_orders"."total_amount_minor" >= 0),
	CONSTRAINT "marketplace_orders_currency_check" CHECK("marketplace_orders"."currency" = 'UZS')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketplace_orders_external_uidx` ON `marketplace_orders` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketplace_orders_workspace_idempotency_uidx` ON `marketplace_orders` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `marketplace_orders_workspace_status_idx` ON `marketplace_orders` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `marketplace_orders_customer_idx` ON `marketplace_orders` (`customer_user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_type` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`title_ru` text NOT NULL,
	`title_uz` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_amount_minor` integer NOT NULL,
	`base_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer DEFAULT 0 NOT NULL,
	`total_amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_items_quantity_check" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_amounts_check" CHECK("order_items"."unit_amount_minor" >= 0 AND "order_items"."base_amount_minor" >= 0 AND "order_items"."tax_amount_minor" >= 0 AND "order_items"."total_amount_minor" >= 0),
	CONSTRAINT "order_items_currency_check" CHECK("order_items"."currency" = 'UZS')
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`order_id` text NOT NULL,
	`payment_id` text,
	`provider` text NOT NULL,
	`provider_attempt_id` text,
	`provider_status` text,
	`internal_status` text DEFAULT 'created' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`idempotency_key` text NOT NULL,
	`checkout_url` text,
	`expires_at` text,
	`settled_at` text,
	`failed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_attempts_amount_check" CHECK("payment_attempts"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_external_uidx` ON `payment_attempts` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_order_idempotency_uidx` ON `payment_attempts` (`order_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_provider_uidx` ON `payment_attempts` (`provider`,`provider_attempt_id`) WHERE "payment_attempts"."provider_attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payment_attempts_order_status_idx` ON `payment_attempts` (`order_id`,`internal_status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `payment_provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`signature_verified` integer DEFAULT false NOT NULL,
	`internal_status` text DEFAULT 'received' NOT NULL,
	`order_id` text,
	`payment_attempt_id` text,
	`received_at` text NOT NULL,
	`processed_at` text,
	`failed_at` text,
	`failure_code` text,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payment_attempt_id`) REFERENCES `payment_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_provider_events_sha_check" CHECK(length("payment_provider_events"."payload_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_provider_events_provider_event_uidx` ON `payment_provider_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `payment_provider_events_status_idx` ON `payment_provider_events` (`internal_status`,`received_at`);--> statement-breakpoint
CREATE TABLE `pricing_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_policies_code_uidx` ON `pricing_policies` (`code`);--> statement-breakpoint
CREATE INDEX `pricing_policies_status_idx` ON `pricing_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `pricing_policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`version` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`provider_commission_rate_basis_points` integer NOT NULL,
	`vat_rate_basis_points` integer NOT NULL,
	`provider_fee_bearer` text NOT NULL,
	`basis` text NOT NULL,
	`contract_number` text,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`approval_status` text DEFAULT 'draft' NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `pricing_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pricing_policy_versions_currency_check" CHECK("pricing_policy_versions"."currency" = 'UZS'),
	CONSTRAINT "pricing_policy_versions_commission_rate_check" CHECK("pricing_policy_versions"."provider_commission_rate_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "pricing_policy_versions_vat_rate_check" CHECK("pricing_policy_versions"."vat_rate_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_policy_versions_policy_version_uidx` ON `pricing_policy_versions` (`policy_id`,`version`);--> statement-breakpoint
CREATE INDEX `pricing_policy_versions_effective_idx` ON `pricing_policy_versions` (`approval_status`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `pricing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`version` integer NOT NULL,
	`lawyer_base_amount_minor` integer NOT NULL,
	`lawyer_vat_amount_minor` integer NOT NULL,
	`lawyer_gross_amount_minor` integer NOT NULL,
	`juro_base_amount_minor` integer NOT NULL,
	`juro_vat_amount_minor` integer NOT NULL,
	`juro_gross_amount_minor` integer NOT NULL,
	`subscription_credit_minor` integer DEFAULT 0 NOT NULL,
	`discount_amount_minor` integer DEFAULT 0 NOT NULL,
	`provider_commission_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`provider_commission_base_minor` integer DEFAULT 0 NOT NULL,
	`provider_commission_amount_minor` integer DEFAULT 0 NOT NULL,
	`provider_commission_allocation_json` text NOT NULL,
	`client_total_minor` integer NOT NULL,
	`expected_provider_settlement_minor` integer NOT NULL,
	`lawyer_expected_payout_minor` integer NOT NULL,
	`juro_expected_revenue_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`tax_policy_version_id` text NOT NULL,
	`pricing_policy_version_id` text NOT NULL,
	`calculation_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pricing_policy_version_id`) REFERENCES `pricing_policy_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pricing_snapshots_nonnegative_check" CHECK("pricing_snapshots"."lawyer_base_amount_minor" >= 0 AND "pricing_snapshots"."lawyer_vat_amount_minor" >= 0 AND "pricing_snapshots"."lawyer_gross_amount_minor" >= 0 AND "pricing_snapshots"."juro_base_amount_minor" >= 0 AND "pricing_snapshots"."juro_vat_amount_minor" >= 0 AND "pricing_snapshots"."juro_gross_amount_minor" >= 0 AND "pricing_snapshots"."subscription_credit_minor" >= 0 AND "pricing_snapshots"."discount_amount_minor" >= 0 AND "pricing_snapshots"."provider_commission_amount_minor" >= 0 AND "pricing_snapshots"."client_total_minor" >= 0 AND "pricing_snapshots"."expected_provider_settlement_minor" >= 0 AND "pricing_snapshots"."lawyer_expected_payout_minor" >= 0 AND "pricing_snapshots"."juro_expected_revenue_minor" >= 0),
	CONSTRAINT "pricing_snapshots_currency_check" CHECK("pricing_snapshots"."currency" = 'UZS')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_snapshots_order_version_uidx` ON `pricing_snapshots` (`order_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_snapshots_calculation_hash_uidx` ON `pricing_snapshots` (`calculation_hash`);--> statement-breakpoint
CREATE INDEX `pricing_snapshots_policy_idx` ON `pricing_snapshots` (`pricing_policy_version_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscription_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`entitlement_code` text NOT NULL,
	`limit_value` integer,
	`unit` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`rollover_allowed` integer DEFAULT false NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_entitlements_limit_check" CHECK("subscription_entitlements"."limit_value" IS NULL OR "subscription_entitlements"."limit_value" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_entitlements_period_uidx` ON `subscription_entitlements` (`subscription_id`,`entitlement_code`,`period_start`);--> statement-breakpoint
CREATE INDEX `subscription_entitlements_active_idx` ON `subscription_entitlements` (`subscription_id`,`period_end`);--> statement-breakpoint
CREATE TABLE `subscription_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`subscription_id` text,
	`order_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`total_amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`due_at` text,
	`issued_at` text,
	`paid_at` text,
	`voided_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_invoices_amounts_check" CHECK("subscription_invoices"."subtotal_minor" >= 0 AND "subscription_invoices"."tax_amount_minor" >= 0 AND "subscription_invoices"."total_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_invoices_external_uidx` ON `subscription_invoices` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_invoices_number_uidx` ON `subscription_invoices` (`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_invoices_order_uidx` ON `subscription_invoices` (`order_id`);--> statement-breakpoint
CREATE INDEX `subscription_invoices_workspace_status_idx` ON `subscription_invoices` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscription_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`name_ru` text NOT NULL,
	`name_uz` text NOT NULL,
	`billing_period` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`entitlements_json` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`approval_status` text DEFAULT 'draft' NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_plan_versions_price_check" CHECK("subscription_plan_versions"."price_minor" >= 0),
	CONSTRAINT "subscription_plan_versions_currency_check" CHECK("subscription_plan_versions"."currency" = 'UZS')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_plan_versions_plan_version_uidx` ON `subscription_plan_versions` (`plan_id`,`version`);--> statement-breakpoint
CREATE INDEX `subscription_plan_versions_effective_idx` ON `subscription_plan_versions` (`approval_status`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_plans_code_uidx` ON `subscription_plans` (`code`);--> statement-breakpoint
CREATE INDEX `subscription_plans_status_idx` ON `subscription_plans` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `tax_components` (
	`id` text PRIMARY KEY NOT NULL,
	`pricing_snapshot_id` text NOT NULL,
	`provider_type` text NOT NULL,
	`provider_id` text NOT NULL,
	`tax_profile_id` text NOT NULL,
	`taxable_base_minor` integer NOT NULL,
	`rate_basis_points` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`pricing_snapshot_id`) REFERENCES `pricing_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tax_profile_id`) REFERENCES `tax_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tax_components_amounts_check" CHECK("tax_components"."taxable_base_minor" >= 0 AND "tax_components"."tax_amount_minor" >= 0 AND "tax_components"."rate_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE INDEX `tax_components_snapshot_idx` ON `tax_components` (`pricing_snapshot_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tax_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`service_type` text NOT NULL,
	`payer_status` text NOT NULL,
	`tax_model` text NOT NULL,
	`vat_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`approval_status` text DEFAULT 'draft' NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tax_profiles_vat_rate_check" CHECK("tax_profiles"."vat_rate_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_profiles_subject_service_version_uidx` ON `tax_profiles` (`subject_type`,`subject_id`,`service_type`,`version`);--> statement-breakpoint
CREATE INDEX `tax_profiles_effective_idx` ON `tax_profiles` (`subject_type`,`subject_id`,`service_type`,`approval_status`,`effective_from`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `plan_version_id` text REFERENCES subscription_plan_versions(id);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `order_id` text REFERENCES marketplace_orders(id);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `billing_period` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `auto_renew_consent_at` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `grace_period_ends_at` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TRIGGER `pricing_policy_versions_immutable_update`
BEFORE UPDATE ON `pricing_policy_versions`
BEGIN
  SELECT RAISE(ABORT, 'PRICING_POLICY_VERSION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `pricing_policy_versions_immutable_delete`
BEFORE DELETE ON `pricing_policy_versions`
BEGIN
  SELECT RAISE(ABORT, 'PRICING_POLICY_VERSION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `subscription_plan_versions_immutable_update`
BEFORE UPDATE ON `subscription_plan_versions`
BEGIN
  SELECT RAISE(ABORT, 'SUBSCRIPTION_PLAN_VERSION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `subscription_plan_versions_immutable_delete`
BEFORE DELETE ON `subscription_plan_versions`
BEGIN
  SELECT RAISE(ABORT, 'SUBSCRIPTION_PLAN_VERSION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `pricing_snapshots_immutable_update`
BEFORE UPDATE ON `pricing_snapshots`
BEGIN
  SELECT RAISE(ABORT, 'PRICING_SNAPSHOT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `pricing_snapshots_immutable_delete`
BEFORE DELETE ON `pricing_snapshots`
BEGIN
  SELECT RAISE(ABORT, 'PRICING_SNAPSHOT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `marketplace_orders_identity_immutable`
BEFORE UPDATE OF `external_id`,`workspace_id`,`customer_user_id`,`order_type`,`currency`,`idempotency_key`
ON `marketplace_orders`
BEGIN
  SELECT RAISE(ABORT, 'MARKETPLACE_ORDER_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `marketplace_orders_snapshot_once`
BEFORE UPDATE OF `accepted_pricing_snapshot_id` ON `marketplace_orders`
WHEN OLD.`accepted_pricing_snapshot_id` IS NOT NULL
  AND NEW.`accepted_pricing_snapshot_id` IS NOT OLD.`accepted_pricing_snapshot_id`
BEGIN
  SELECT RAISE(ABORT, 'ORDER_PRICING_SNAPSHOT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `marketplace_orders_snapshot_belongs_to_order`
BEFORE UPDATE OF `accepted_pricing_snapshot_id`,`total_amount_minor` ON `marketplace_orders`
WHEN NEW.`accepted_pricing_snapshot_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `pricing_snapshots` s
    WHERE s.`id` = NEW.`accepted_pricing_snapshot_id`
      AND s.`order_id` = NEW.`id`
      AND s.`client_total_minor` = NEW.`total_amount_minor`
  )
BEGIN
  SELECT RAISE(ABORT, 'ORDER_PRICING_SNAPSHOT_MISMATCH');
END;--> statement-breakpoint
CREATE TRIGGER `ledger_transactions_post_guard`
BEFORE UPDATE OF `status`,`debit_total_minor`,`credit_total_minor` ON `ledger_transactions`
WHEN NEW.`status` = 'posted'
  AND (
    NEW.`debit_total_minor` != NEW.`credit_total_minor`
    OR NEW.`debit_total_minor` <= 0
    OR NEW.`debit_total_minor` != COALESCE((
      SELECT SUM(e.`amount_minor`) FROM `ledger_entries` e
      WHERE e.`transaction_id` = NEW.`id` AND e.`side` = 'DEBIT'
    ), 0)
    OR NEW.`credit_total_minor` != COALESCE((
      SELECT SUM(e.`amount_minor`) FROM `ledger_entries` e
      WHERE e.`transaction_id` = NEW.`id` AND e.`side` = 'CREDIT'
    ), 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'LEDGER_TRANSACTION_UNBALANCED');
END;--> statement-breakpoint
CREATE TRIGGER `ledger_transactions_posted_immutable_update`
BEFORE UPDATE ON `ledger_transactions`
WHEN OLD.`status` = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'POSTED_LEDGER_TRANSACTION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `ledger_transactions_posted_immutable_delete`
BEFORE DELETE ON `ledger_transactions`
WHEN OLD.`status` = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'POSTED_LEDGER_TRANSACTION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `ledger_entries_posted_immutable_update`
BEFORE UPDATE ON `ledger_entries`
WHEN EXISTS (SELECT 1 FROM `ledger_transactions` t WHERE t.`id` = OLD.`transaction_id` AND t.`status` = 'posted')
BEGIN
  SELECT RAISE(ABORT, 'POSTED_LEDGER_ENTRY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `ledger_entries_posted_immutable_delete`
BEFORE DELETE ON `ledger_entries`
WHEN EXISTS (SELECT 1 FROM `ledger_transactions` t WHERE t.`id` = OLD.`transaction_id` AND t.`status` = 'posted')
BEGIN
  SELECT RAISE(ABORT, 'POSTED_LEDGER_ENTRY_IMMUTABLE');
END;
