-- Migration 0066: authenticated, short-lived voice messages for AI-lawyer chats.
-- Audio object keys contain no user-provided names. Transcript drafts are encrypted.
-- Expand-only; realtime voice and avatar remain independently feature-flagged.
CREATE TABLE `voice_recordings` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `conversation_id` text,
  `case_id` text,
  `message_id` text,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `object_key` text NOT NULL,
  `quarantine_key` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `duration_ms` integer NOT NULL,
  `sha256` text NOT NULL,
  `locale` text NOT NULL,
  `status` text DEFAULT 'initiated' NOT NULL,
  `transcript_ciphertext` text,
  `transcript_iv` text,
  `transcript_key_version` text,
  `provider` text,
  `model` text,
  `error_code` text,
  `expires_at` text NOT NULL,
  `uploaded_at` text,
  `transcribed_at` text,
  `submitted_at` text,
  `deleted_at` text,
  `purged_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `voice_recordings_locale_check` CHECK(`locale` IN ('ru','uz')),
  CONSTRAINT `voice_recordings_status_check` CHECK(`status` IN ('initiated','uploaded','ready','transcribing','transcribed','submitted','failed','deleted','purged')),
  CONSTRAINT `voice_recordings_size_check` CHECK(`size_bytes` BETWEEN 1 AND 26214400),
  CONSTRAINT `voice_recordings_duration_check` CHECK(`duration_ms` BETWEEN 1 AND 300000),
  CONSTRAINT `voice_recordings_sha_check` CHECK(length(`sha256`)=64),
  CONSTRAINT `voice_recordings_request_hash_check` CHECK(length(`request_hash`)=64),
  CONSTRAINT `voice_recordings_transcript_check` CHECK(
    (`status` IN ('transcribed','submitted') AND `transcript_ciphertext` IS NOT NULL AND `transcript_iv` IS NOT NULL AND `transcript_key_version` IS NOT NULL AND `transcribed_at` IS NOT NULL)
    OR (`status` NOT IN ('transcribed','submitted') AND `transcript_ciphertext` IS NULL AND `transcript_iv` IS NULL AND `transcript_key_version` IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `voice_recordings_user_idempotency_uidx` ON `voice_recordings` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `voice_recordings_object_key_uidx` ON `voice_recordings` (`object_key`);--> statement-breakpoint
CREATE INDEX `voice_recordings_workspace_created_idx` ON `voice_recordings` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `voice_recordings_retention_idx` ON `voice_recordings` (`status`,`expires_at`);
