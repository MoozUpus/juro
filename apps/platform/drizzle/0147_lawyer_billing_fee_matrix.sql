CREATE TABLE `billing_fee_policy_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `version` integer NOT NULL,
  `mode` text DEFAULT 'sandbox' NOT NULL,
  `consultation_fee_basis_points` integer DEFAULT 100 NOT NULL,
  `installment_service_markup_basis_points` integer DEFAULT 0 NOT NULL,
  `installment_waives_case_transfer` integer DEFAULT 1 NOT NULL,
  `effective_from` text NOT NULL,
  `effective_to` text,
  `created_by_user_id` text,
  `reason` text NOT NULL,
  `source` text DEFAULT 'admin' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`mode` IN ('sandbox','production')),
  CHECK (`consultation_fee_basis_points` BETWEEN 0 AND 10000),
  CHECK (`installment_service_markup_basis_points` BETWEEN 0 AND 10000),
  CHECK (`installment_waives_case_transfer` IN (0,1)),
  CHECK (`effective_to` IS NULL OR `effective_from` < `effective_to`),
  CHECK (length(trim(`reason`)) BETWEEN 3 AND 2000),
  CHECK (`source` IN ('system','admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_fee_policy_versions_version_uidx` ON `billing_fee_policy_versions` (`version`);
--> statement-breakpoint
CREATE INDEX `billing_fee_policy_versions_effective_idx` ON `billing_fee_policy_versions` (`mode`,`effective_from`,`effective_to`);
--> statement-breakpoint
INSERT INTO `billing_fee_policy_versions`
(`id`,`version`,`mode`,`consultation_fee_basis_points`,`installment_service_markup_basis_points`,
 `installment_waives_case_transfer`,`effective_from`,`effective_to`,`created_by_user_id`,`reason`,`source`,`created_at`)
VALUES ('billing-fee-system-v1',1,'sandbox',100,0,1,'2020-01-01T00:00:00.000Z',NULL,NULL,
  'Initial sandbox policy: 1% consultation fee and no double case-transfer fee for installments.','system','2020-01-01T00:00:00.000Z');
--> statement-breakpoint
CREATE TABLE `billing_case_transfer_fee_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `version` integer NOT NULL,
  `label_ru` text NOT NULL,
  `label_uz` text NOT NULL,
  `legal_area` text,
  `case_type` text,
  `fee_basis_points` integer NOT NULL,
  `priority` integer DEFAULT 100 NOT NULL,
  `effective_from` text NOT NULL,
  `effective_to` text,
  `created_by_user_id` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`fee_basis_points` IN (200,500)),
  CHECK (`priority` BETWEEN 0 AND 10000),
  CHECK (`legal_area` IS NOT NULL OR `case_type` IS NOT NULL),
  CHECK (`effective_to` IS NULL OR `effective_from` < `effective_to`),
  CHECK (length(trim(`label_ru`)) BETWEEN 3 AND 160),
  CHECK (length(trim(`label_uz`)) BETWEEN 3 AND 160),
  CHECK (length(trim(`reason`)) BETWEEN 3 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_case_transfer_fee_rules_version_uidx` ON `billing_case_transfer_fee_rules` (`version`);
--> statement-breakpoint
CREATE INDEX `billing_case_transfer_fee_rules_match_idx` ON `billing_case_transfer_fee_rules` (`legal_area`,`case_type`,`effective_from`,`effective_to`,`priority`);
--> statement-breakpoint
CREATE TABLE `billing_fee_configuration_events` (
  `id` text PRIMARY KEY NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `action` text NOT NULL,
  `actor_user_id` text,
  `reason` text NOT NULL,
  `previous_snapshot_json` text,
  `next_snapshot_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`entity_type` IN ('fee_policy','case_transfer_rule')),
  CHECK (`action` IN ('system_seeded','created')),
  CHECK (length(trim(`reason`)) BETWEEN 3 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `billing_fee_configuration_events_entity_idx` ON `billing_fee_configuration_events` (`entity_type`,`entity_id`,`created_at`);
--> statement-breakpoint
INSERT INTO `billing_fee_configuration_events`
(`id`,`entity_type`,`entity_id`,`action`,`actor_user_id`,`reason`,`previous_snapshot_json`,`next_snapshot_json`,`created_at`)
VALUES ('billing-fee-system-v1-event','fee_policy','billing-fee-system-v1','system_seeded',NULL,
  'Initial sandbox fee policy. No case-transfer category is inferred.',NULL,
  '{"consultationFeeBasisPoints":100,"installmentServiceMarkupBasisPoints":0,"installmentWaivesCaseTransfer":true,"mode":"sandbox"}',
  '2020-01-01T00:00:00.000Z');
--> statement-breakpoint
CREATE TRIGGER `billing_fee_policy_versions_no_update` BEFORE UPDATE ON `billing_fee_policy_versions` BEGIN SELECT RAISE(ABORT, 'BILLING_FEE_POLICY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_fee_policy_versions_no_delete` BEFORE DELETE ON `billing_fee_policy_versions` BEGIN SELECT RAISE(ABORT, 'BILLING_FEE_POLICY_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_case_transfer_fee_rules_no_update` BEFORE UPDATE ON `billing_case_transfer_fee_rules` BEGIN SELECT RAISE(ABORT, 'BILLING_FEE_RULE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_case_transfer_fee_rules_no_delete` BEFORE DELETE ON `billing_case_transfer_fee_rules` BEGIN SELECT RAISE(ABORT, 'BILLING_FEE_RULE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_fee_configuration_events_no_update` BEFORE UPDATE ON `billing_fee_configuration_events` BEGIN SELECT RAISE(ABORT, 'BILLING_FEE_EVENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_fee_configuration_events_no_delete` BEFORE DELETE ON `billing_fee_configuration_events` BEGIN SELECT RAISE(ABORT, 'BILLING_FEE_EVENT_APPEND_ONLY'); END;
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `service_kind` text CHECK (`service_kind` IS NULL OR `service_kind` IN ('subscription','consultation','case_transfer'));
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `payment_method` text CHECK (`payment_method` IS NULL OR `payment_method` IN ('direct','installment'));
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `legal_area` text;
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `fee_policy_version_id` text REFERENCES `billing_fee_policy_versions`(`id`) ON UPDATE no action ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `case_transfer_fee_rule_id` text REFERENCES `billing_case_transfer_fee_rules`(`id`) ON UPDATE no action ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `lawyer_service_amount_minor` integer CHECK (`lawyer_service_amount_minor` IS NULL OR `lawyer_service_amount_minor` > 0);
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `consultation_fee_amount_minor` integer CHECK (`consultation_fee_amount_minor` IS NULL OR `consultation_fee_amount_minor` >= 0);
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `case_transfer_fee_amount_minor` integer CHECK (`case_transfer_fee_amount_minor` IS NULL OR `case_transfer_fee_amount_minor` >= 0);
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `juro_service_markup_minor` integer CHECK (`juro_service_markup_minor` IS NULL OR `juro_service_markup_minor` >= 0);
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `client_total_minor` integer CHECK (`client_total_minor` IS NULL OR `client_total_minor` > 0);
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `lawyer_payout_minor` integer CHECK (`lawyer_payout_minor` IS NULL OR `lawyer_payout_minor` >= 0);
--> statement-breakpoint
ALTER TABLE `demo_payment_runs` ADD COLUMN `breakdown_json` text;
--> statement-breakpoint
CREATE TRIGGER `demo_payment_runs_fee_identity_immutable`
BEFORE UPDATE OF `service_kind`,`payment_method`,`legal_area`,`fee_policy_version_id`,`case_transfer_fee_rule_id`,
  `lawyer_service_amount_minor`,`consultation_fee_amount_minor`,`case_transfer_fee_amount_minor`,
  `juro_service_markup_minor`,`client_total_minor`,`lawyer_payout_minor`,`breakdown_json`
ON `demo_payment_runs` BEGIN SELECT RAISE(ABORT, 'DEMO_PAYMENT_FEE_SNAPSHOT_IMMUTABLE'); END;
