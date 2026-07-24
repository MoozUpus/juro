ALTER TABLE `documents` ADD `template_code` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `template_version` text;--> statement-breakpoint
UPDATE `documents`
SET `template_code` = 'receipt-money', `template_version` = '1.0.0'
WHERE `template_id` = 'receipt-money-v1' AND `template_code` IS NULL;
