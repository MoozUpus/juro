UPDATE `documents`
SET `workspace_id` = (
	SELECT p.`default_workspace_id`
	FROM `user_profiles` p
	JOIN `workspace_members` m
	  ON m.`workspace_id` = p.`default_workspace_id`
	 AND m.`user_id` = p.`id`
	 AND m.`status` = 'active'
	WHERE p.`id` = `documents`.`owner_user_id`
	LIMIT 1
)
WHERE `workspace_id` IS NULL
  AND EXISTS (
	SELECT 1
	FROM `user_profiles` p
	JOIN `workspace_members` m
	  ON m.`workspace_id` = p.`default_workspace_id`
	 AND m.`user_id` = p.`id`
	 AND m.`status` = 'active'
	WHERE p.`id` = `documents`.`owner_user_id`
  );--> statement-breakpoint
UPDATE `document_files`
SET `workspace_id` = (
	SELECT d.`workspace_id`
	FROM `documents` d
	WHERE d.`id` = `document_files`.`document_id`
	  AND d.`workspace_id` IS NOT NULL
	LIMIT 1
)
WHERE `workspace_id` IS NULL
  AND `document_id` IS NOT NULL
  AND EXISTS (
	SELECT 1
	FROM `documents` d
	WHERE d.`id` = `document_files`.`document_id`
	  AND d.`workspace_id` IS NOT NULL
  );--> statement-breakpoint
UPDATE `document_files`
SET `workspace_id` = (
	SELECT p.`default_workspace_id`
	FROM `user_profiles` p
	JOIN `workspace_members` m
	  ON m.`workspace_id` = p.`default_workspace_id`
	 AND m.`user_id` = p.`id`
	 AND m.`status` = 'active'
	WHERE p.`id` = `document_files`.`owner_user_id`
	LIMIT 1
)
WHERE `workspace_id` IS NULL
  AND EXISTS (
	SELECT 1
	FROM `user_profiles` p
	JOIN `workspace_members` m
	  ON m.`workspace_id` = p.`default_workspace_id`
	 AND m.`user_id` = p.`id`
	 AND m.`status` = 'active'
	WHERE p.`id` = `document_files`.`owner_user_id`
  );--> statement-breakpoint
CREATE INDEX `auth_otp_ip_created_idx` ON `auth_otp_challenges` (`request_ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `documents_workspace_updated_idx` ON `documents` (`workspace_id`,`updated_at`);
