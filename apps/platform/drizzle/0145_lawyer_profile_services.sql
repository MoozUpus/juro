ALTER TABLE `lawyer_profiles`
  ADD COLUMN `consultation_duration_minutes` integer DEFAULT 60 NOT NULL
  CHECK (`consultation_duration_minutes` BETWEEN 15 AND 480);
--> statement-breakpoint
ALTER TABLE `lawyer_profiles`
  ADD COLUMN `additional_services_json` text DEFAULT '[]' NOT NULL;
