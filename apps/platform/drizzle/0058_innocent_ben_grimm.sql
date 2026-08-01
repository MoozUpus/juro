ALTER TABLE `lawyer_profiles` ADD COLUMN `experience_years` integer;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `price_description` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `availability_status` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `next_available_at` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `advocate_status` text DEFAULT 'not_declared' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `firm_name` text;
--> statement-breakpoint
ALTER TABLE `lawyer_profiles` ADD COLUMN `bio` text;
--> statement-breakpoint
CREATE INDEX `lawyer_profiles_directory_filter_idx` ON `lawyer_profiles` (`status`,`public_approved_at`,`availability_status`,`advocate_status`,`experience_years`);
--> statement-breakpoint
CREATE TRIGGER `lawyer_profiles_directory_values_insert`
BEFORE INSERT ON `lawyer_profiles`
WHEN (NEW.`experience_years` IS NOT NULL AND (NEW.`experience_years` < 0 OR NEW.`experience_years` > 99))
  OR NEW.`availability_status` NOT IN ('unknown','available','limited','unavailable')
  OR NEW.`advocate_status` NOT IN ('not_declared','declared','verified')
BEGIN
  SELECT RAISE(ABORT, 'invalid lawyer directory profile values');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_profiles_directory_values_update`
BEFORE UPDATE OF `experience_years`,`availability_status`,`advocate_status` ON `lawyer_profiles`
WHEN (NEW.`experience_years` IS NOT NULL AND (NEW.`experience_years` < 0 OR NEW.`experience_years` > 99))
  OR NEW.`availability_status` NOT IN ('unknown','available','limited','unavailable')
  OR NEW.`advocate_status` NOT IN ('not_declared','declared','verified')
BEGIN
  SELECT RAISE(ABORT, 'invalid lawyer directory profile values');
END;
