ALTER TABLE `workspace_invitations` ADD `acceptance_claim_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_acceptance_claim_uidx`
ON `workspace_invitations` (`acceptance_claim_id`)
WHERE `acceptance_claim_id` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `workspace_invitations_acceptance_insert_guard`
BEFORE INSERT ON `workspace_invitations`
WHEN
  (NEW.`accepted_at` IS NULL AND NEW.`acceptance_claim_id` IS NOT NULL)
  OR
  (NEW.`accepted_at` IS NOT NULL AND NEW.`acceptance_claim_id` IS NULL)
BEGIN
  SELECT RAISE(
    ABORT,
    'workspace invitation acceptance evidence incomplete'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `workspace_invitations_acceptance_update_guard`
BEFORE UPDATE OF `accepted_at`,`acceptance_claim_id`
ON `workspace_invitations`
WHEN
  (NEW.`accepted_at` IS NULL AND NEW.`acceptance_claim_id` IS NOT NULL)
  OR
  (NEW.`accepted_at` IS NOT NULL AND NEW.`acceptance_claim_id` IS NULL)
BEGIN
  SELECT RAISE(
    ABORT,
    'workspace invitation acceptance evidence incomplete'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `workspace_invitations_acceptance_immutable_guard`
BEFORE UPDATE OF `accepted_at`,`acceptance_claim_id`
ON `workspace_invitations`
WHEN
  OLD.`acceptance_claim_id` IS NOT NULL
  AND (
    NEW.`accepted_at` IS NOT OLD.`accepted_at`
    OR NEW.`acceptance_claim_id` IS NOT OLD.`acceptance_claim_id`
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'workspace invitation acceptance is immutable'
  );
END;
