CREATE TABLE `auth_device_continuities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hmac` text NOT NULL,
	`key_version` text NOT NULL,
	`first_country_code` text,
	`first_region_code` text,
	`last_country_code` text,
	`last_region_code` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_device_continuities_hmac_check" CHECK(length("auth_device_continuities"."token_hmac") = 43
        AND "auth_device_continuities"."token_hmac" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "auth_device_continuities_country_check" CHECK(("auth_device_continuities"."first_country_code" IS NULL OR (
          length("auth_device_continuities"."first_country_code") = 2
          AND "auth_device_continuities"."first_country_code" NOT GLOB '*[^A-Z0-9]*'
        )) AND ("auth_device_continuities"."last_country_code" IS NULL OR (
          length("auth_device_continuities"."last_country_code") = 2
          AND "auth_device_continuities"."last_country_code" NOT GLOB '*[^A-Z0-9]*'
        ))),
	CONSTRAINT "auth_device_continuities_region_check" CHECK(("auth_device_continuities"."first_region_code" IS NULL OR (
          length("auth_device_continuities"."first_region_code") BETWEEN 1 AND 12
          AND "auth_device_continuities"."first_region_code" NOT GLOB '*[^A-Z0-9-]*'
        )) AND ("auth_device_continuities"."last_region_code" IS NULL OR (
          length("auth_device_continuities"."last_region_code") BETWEEN 1 AND 12
          AND "auth_device_continuities"."last_region_code" NOT GLOB '*[^A-Z0-9-]*'
        )))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_device_continuities_lookup_uidx` ON `auth_device_continuities` (`user_id`,`key_version`,`token_hmac`);--> statement-breakpoint
CREATE INDEX `auth_device_continuities_user_idx` ON `auth_device_continuities` (`user_id`,`last_seen_at`);--> statement-breakpoint
ALTER TABLE `auth_devices` ADD `continuity_id` text REFERENCES auth_device_continuities(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `auth_devices_continuity_idx` ON `auth_devices` (`continuity_id`);