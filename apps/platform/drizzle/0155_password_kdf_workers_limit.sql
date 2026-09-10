CREATE TABLE `__new_user_password_credentials` (
  `user_id` text PRIMARY KEY NOT NULL,
  `algorithm` text DEFAULT 'PBKDF2-SHA256' NOT NULL,
  `iterations` integer DEFAULT 100000 NOT NULL,
  `salt_base64url` text NOT NULL,
  `hash_base64url` text NOT NULL,
  `password_changed_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "user_password_algorithm_check" CHECK("__new_user_password_credentials"."algorithm" = 'PBKDF2-SHA256'),
  CONSTRAINT "user_password_iterations_check" CHECK("__new_user_password_credentials"."iterations" = 100000),
  CONSTRAINT "user_password_salt_check" CHECK(length("__new_user_password_credentials"."salt_base64url") BETWEEN 22 AND 64),
  CONSTRAINT "user_password_hash_check" CHECK(length("__new_user_password_credentials"."hash_base64url") = 43)
);
--> statement-breakpoint
INSERT INTO `__new_user_password_credentials`(
  `user_id`,`algorithm`,`iterations`,`salt_base64url`,`hash_base64url`,
  `password_changed_at`,`created_at`,`updated_at`
)
SELECT
  `user_id`,`algorithm`,`iterations`,`salt_base64url`,`hash_base64url`,
  `password_changed_at`,`created_at`,`updated_at`
FROM `user_password_credentials`;
--> statement-breakpoint
DROP TABLE `user_password_credentials`;
--> statement-breakpoint
ALTER TABLE `__new_user_password_credentials` RENAME TO `user_password_credentials`;
