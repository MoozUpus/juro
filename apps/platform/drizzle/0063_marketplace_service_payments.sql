-- Stage 2: marketplace legal-service proposals, explicit client acceptance,
-- settlement allocation and payable records. Expand-only; no production data is removed.
ALTER TABLE `pricing_policy_versions` ADD `marketplace_commission_rate_basis_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TABLE `legal_service_proposals` (
  `id` text PRIMARY KEY NOT NULL,
  `external_id` text NOT NULL,
  `lawyer_request_id` text NOT NULL,
  `case_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `client_user_id` text NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `version` integer NOT NULL,
  `status` text DEFAULT 'DRAFT' NOT NULL,
  `title_ru` text NOT NULL,
  `title_uz` text NOT NULL,
  `scope_ru` text NOT NULL,
  `scope_uz` text NOT NULL,
  `duration_description` text NOT NULL,
  `lawyer_base_amount_minor` integer NOT NULL,
  `currency` text DEFAULT 'UZS' NOT NULL,
  `expires_at` text,
  `accepted_at` text,
  `declined_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lawyer_request_id`) REFERENCES `lawyer_requests`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`client_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_service_proposals_amount_check` CHECK(`lawyer_base_amount_minor` > 0),
  CONSTRAINT `legal_service_proposals_currency_check` CHECK(`currency` = 'UZS')
);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_service_proposals_external_uidx` ON `legal_service_proposals` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_service_proposals_request_version_uidx` ON `legal_service_proposals` (`lawyer_request_id`,`version`);--> statement-breakpoint
CREATE INDEX `legal_service_proposals_client_status_idx` ON `legal_service_proposals` (`workspace_id`,`client_user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `legal_service_proposals_lawyer_status_idx` ON `legal_service_proposals` (`lawyer_user_id`,`status`,`updated_at`);--> statement-breakpoint

CREATE TABLE `legal_service_proposal_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `proposal_id` text NOT NULL,
  `version` integer NOT NULL,
  `snapshot_json` text NOT NULL,
  `snapshot_sha256` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`proposal_id`) REFERENCES `legal_service_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `legal_service_proposal_versions_hash_check` CHECK(length(`snapshot_sha256`) = 64)
);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_service_proposal_versions_proposal_version_uidx` ON `legal_service_proposal_versions` (`proposal_id`,`version`);--> statement-breakpoint

CREATE TABLE `proposal_milestones` (
  `id` text PRIMARY KEY NOT NULL,
  `proposal_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `title_ru` text NOT NULL,
  `title_uz` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `status` text DEFAULT 'planned' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`proposal_id`) REFERENCES `legal_service_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `proposal_milestones_amount_check` CHECK(`amount_minor` > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_milestones_sequence_uidx` ON `proposal_milestones` (`proposal_id`,`sequence`);--> statement-breakpoint

CREATE TABLE `proposal_acceptances` (
  `id` text PRIMARY KEY NOT NULL,
  `proposal_id` text NOT NULL,
  `client_user_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `agreement_version` text NOT NULL,
  `agreement_sha256` text NOT NULL,
  `consent_scope_json` text NOT NULL,
  `accepted_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`proposal_id`) REFERENCES `legal_service_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`client_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `proposal_acceptances_hash_check` CHECK(length(`agreement_sha256`) = 64)
);--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_acceptances_proposal_uidx` ON `proposal_acceptances` (`proposal_id`);--> statement-breakpoint

CREATE TABLE `order_agreements` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `proposal_id` text NOT NULL,
  `acceptance_id` text NOT NULL,
  `agreement_version` text NOT NULL,
  `agreement_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`proposal_id`) REFERENCES `legal_service_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`acceptance_id`) REFERENCES `proposal_acceptances`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `order_agreements_hash_check` CHECK(length(`agreement_sha256`) = 64)
);--> statement-breakpoint
CREATE UNIQUE INDEX `order_agreements_order_uidx` ON `order_agreements` (`order_id`);--> statement-breakpoint

CREATE TABLE `order_consents` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `user_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `type` text NOT NULL,
  `version` text NOT NULL,
  `scope_json` text NOT NULL,
  `granted_at` text NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE UNIQUE INDEX `order_consents_order_type_uidx` ON `order_consents` (`order_id`,`type`);--> statement-breakpoint

CREATE TABLE `settlement_allocations` (
  `id` text PRIMARY KEY NOT NULL,
  `external_id` text NOT NULL,
  `order_id` text NOT NULL,
  `proposal_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `allocation_type` text NOT NULL,
  `status` text DEFAULT 'PENDING_SETTLEMENT' NOT NULL,
  `gross_amount_minor` integer NOT NULL,
  `provider_fee_share_minor` integer DEFAULT 0 NOT NULL,
  `net_amount_minor` integer NOT NULL,
  `currency` text DEFAULT 'UZS' NOT NULL,
  `idempotency_key` text NOT NULL,
  `settled_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`proposal_id`) REFERENCES `legal_service_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `settlement_allocations_amounts_check` CHECK(`gross_amount_minor` >= 0 AND `provider_fee_share_minor` >= 0 AND `net_amount_minor` >= 0 AND `net_amount_minor` = `gross_amount_minor` - `provider_fee_share_minor`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_allocations_external_uidx` ON `settlement_allocations` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_allocations_order_idempotency_uidx` ON `settlement_allocations` (`order_id`,`idempotency_key`);--> statement-breakpoint

CREATE TABLE `lawyer_payables` (
  `id` text PRIMARY KEY NOT NULL,
  `external_id` text NOT NULL,
  `settlement_allocation_id` text NOT NULL,
  `order_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `lawyer_profile_id` text NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `status` text DEFAULT 'PENDING_SETTLEMENT' NOT NULL,
  `amount_minor` integer NOT NULL,
  `currency` text DEFAULT 'UZS' NOT NULL,
  `idempotency_key` text NOT NULL,
  `available_at` text,
  `paid_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`settlement_allocation_id`) REFERENCES `settlement_allocations`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`lawyer_profile_id`) REFERENCES `lawyer_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `lawyer_payables_amount_check` CHECK(`amount_minor` > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_payables_external_uidx` ON `lawyer_payables` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_payables_allocation_uidx` ON `lawyer_payables` (`settlement_allocation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_payables_order_idempotency_uidx` ON `lawyer_payables` (`order_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `lawyer_payables_lawyer_status_idx` ON `lawyer_payables` (`lawyer_user_id`,`status`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `legal_service_proposal_versions_immutable_update` BEFORE UPDATE ON `legal_service_proposal_versions` BEGIN SELECT RAISE(ABORT, 'LEGAL_SERVICE_PROPOSAL_VERSION_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `legal_service_proposal_versions_immutable_delete` BEFORE DELETE ON `legal_service_proposal_versions` BEGIN SELECT RAISE(ABORT, 'LEGAL_SERVICE_PROPOSAL_VERSION_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `proposal_acceptances_immutable_update` BEFORE UPDATE ON `proposal_acceptances` BEGIN SELECT RAISE(ABORT, 'PROPOSAL_ACCEPTANCE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `proposal_acceptances_immutable_delete` BEFORE DELETE ON `proposal_acceptances` BEGIN SELECT RAISE(ABORT, 'PROPOSAL_ACCEPTANCE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `marketplace_policy_commission_range` BEFORE INSERT ON `pricing_policy_versions` WHEN NEW.`marketplace_commission_rate_basis_points` NOT BETWEEN 0 AND 10000 BEGIN SELECT RAISE(ABORT, 'MARKETPLACE_COMMISSION_RATE_INVALID'); END;
