CREATE TABLE `auth_pending_registrations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `auth_pending_registrations_expiry_check` CHECK(
		`updated_at` >= `created_at` AND `expires_at` > `updated_at`
	)
);
--> statement-breakpoint
CREATE INDEX `auth_pending_registrations_expiry_idx` ON `auth_pending_registrations` (`expires_at`,`user_id`);
--> statement-breakpoint
INSERT INTO `auth_pending_registrations` (
	`user_id`,`expires_at`,`created_at`,`updated_at`
)
SELECT
	profile.`id`,
	strftime('%Y-%m-%dT%H:%M:%fZ', profile.`updated_at`, '+24 hours'),
	strftime('%Y-%m-%dT%H:%M:%fZ', profile.`created_at`),
	strftime('%Y-%m-%dT%H:%M:%fZ', profile.`updated_at`)
FROM `user_profiles` profile
JOIN `user_password_credentials` credential
	ON credential.`user_id`=profile.`id`
WHERE profile.`email_verified_at` IS NULL
	AND profile.`lifecycle_status`='active'
	AND profile.`default_workspace_id` IS NULL
	AND profile.`onboarding_completed_at` IS NULL
	AND julianday(profile.`created_at`) IS NOT NULL
	AND julianday(profile.`updated_at`) IS NOT NULL
	AND julianday(profile.`updated_at`) >= julianday(profile.`created_at`)
	AND credential.`updated_at`=profile.`updated_at`
	AND EXISTS (
		SELECT 1 FROM `auth_otp_challenges` registration_otp
		WHERE registration_otp.`purpose`='register'
			AND lower(registration_otp.`email`)=lower(profile.`email`)
			AND registration_otp.`created_at`=profile.`updated_at`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `auth_sessions` session
		WHERE session.`user_id`=profile.`id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `workspace_members` member
		WHERE member.`user_id`=profile.`id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `workspaces` workspace
		WHERE workspace.`created_by_user_id`=profile.`id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `user_acceptances` acceptance
		WHERE acceptance.`user_id`=profile.`id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `consents` consent
		WHERE consent.`user_id`=profile.`id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `security_email_jobs` email_job
		WHERE email_job.`user_id`=profile.`id`
	)
	AND NOT EXISTS (
		SELECT 1 FROM `lawyer_profiles` lawyer
		WHERE lawyer.`user_id`=profile.`id`
	);
