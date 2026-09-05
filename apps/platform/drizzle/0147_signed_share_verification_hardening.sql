ALTER TABLE `standalone_signed_pdf_shares` ADD `access_code_digits` integer DEFAULT 4 NOT NULL CHECK (`access_code_digits` IN (4, 6));--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD `verification_attempt_count` integer DEFAULT 0 NOT NULL CHECK (`verification_attempt_count` >= 0);--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD `verification_window_started_at` text;--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD `verification_locked_until` text;--> statement-breakpoint
UPDATE `standalone_signed_pdf_shares` SET `access_code` = '';--> statement-breakpoint
CREATE INDEX `signed_share_sessions_expiry_idx` ON `signed_share_sessions` (`expires_at`);--> statement-breakpoint
UPDATE `lawyer_access_grants`
SET `revoked_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    `revoke_reason` = 'requester_removed'
WHERE `revoked_at` IS NULL
  AND EXISTS (
    SELECT 1 FROM `lawyer_requests` r
    LEFT JOIN `workspace_members` m
      ON m.`workspace_id` = r.`workspace_id`
     AND m.`user_id` = r.`requester_user_id`
     AND m.`status` = 'active'
    WHERE r.`id` = `lawyer_access_grants`.`lawyer_request_id`
      AND m.`id` IS NULL
  );--> statement-breakpoint
UPDATE `lawyer_requests`
SET `status` = 'access_revoked',
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `status` = 'access_granted'
  AND EXISTS (
    SELECT 1 FROM `lawyer_access_grants` g
    WHERE g.`lawyer_request_id` = `lawyer_requests`.`id`
      AND g.`revoke_reason` = 'requester_removed'
  );
