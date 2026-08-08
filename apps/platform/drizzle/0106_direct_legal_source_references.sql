-- Migration 0106: limited, query-scoped official-source citations.
-- This table stores only the metadata and short excerpt displayed with a
-- completed AI response. It is intentionally not a legal corpus and has no
-- link to the legacy source/version/chunk tables.
CREATE TABLE `legal_source_references` (
  `id` text PRIMARY KEY NOT NULL,
  `ai_run_id` text,
  `guest_run_id` text,
  `conversation_id` text,
  `message_id` text,
  `source_kind` text NOT NULL,
  `source_locale` text NOT NULL,
  `canonical_id` text,
  `source_url` text NOT NULL,
  `canonical_url` text NOT NULL,
  `title` text NOT NULL,
  `act_identifier` text,
  `article_reference` text,
  `excerpt` text,
  `document_status` text,
  `effective_date` text,
  `retrieved_at` text NOT NULL,
  `validated_at` text NOT NULL,
  `content_sha256` text NOT NULL,
  `fetch_status` text NOT NULL,
  `citation_validation_status` text NOT NULL,
  `source_access_mode` text NOT NULL DEFAULT 'direct',
  `created_at` text NOT NULL,
  FOREIGN KEY (`ai_run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`guest_run_id`) REFERENCES `guest_ai_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `legal_source_references_kind_check` CHECK (`source_kind` IN ('lex','advice','internal','package')),
  CONSTRAINT `legal_source_references_locale_check` CHECK (`source_locale` IN ('ru','uz')),
  CONSTRAINT `legal_source_references_run_check` CHECK ((`ai_run_id` IS NOT NULL AND `guest_run_id` IS NULL) OR (`ai_run_id` IS NULL AND `guest_run_id` IS NOT NULL)),
  CONSTRAINT `legal_source_references_excerpt_limit` CHECK (`excerpt` IS NULL OR length(`excerpt`)<=1200),
  CONSTRAINT `legal_source_references_hash_check` CHECK (length(`content_sha256`)=64 AND `content_sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_source_references_fetch_check` CHECK (`fetch_status` IN ('success','unavailable')),
  CONSTRAINT `legal_source_references_validation_check` CHECK (`citation_validation_status` IN ('validated','unavailable')),
  CONSTRAINT `legal_source_references_access_check` CHECK (`source_access_mode` IN ('direct','approved_package'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_references_run_url_uidx` ON `legal_source_references` (`ai_run_id`,`guest_run_id`,`canonical_url`);--> statement-breakpoint
CREATE INDEX `legal_source_references_conversation_idx` ON `legal_source_references` (`conversation_id`,`created_at` DESC);--> statement-breakpoint
CREATE INDEX `legal_source_references_guest_idx` ON `legal_source_references` (`guest_run_id`,`created_at` DESC);--> statement-breakpoint
