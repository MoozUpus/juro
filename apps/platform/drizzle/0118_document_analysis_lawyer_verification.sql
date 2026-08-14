-- A voluntary, version-specific professional review marker. It is not an
-- approval by JURO or Lex.uz and never gates the AI analysis itself.
CREATE TABLE `document_analysis_lawyer_verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `document_version_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `case_id` text NOT NULL,
  `lawyer_user_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'verified',
  `comment` text,
  `verified_at` text NOT NULL,
  `invalidated_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`analysis_id`) REFERENCES `document_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`document_version_id`) REFERENCES `analysis_document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lawyer_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `document_analysis_lawyer_verification_status_check`
    CHECK (`status` IN ('verified','needs_recheck')),
  CONSTRAINT `document_analysis_lawyer_verification_comment_check`
    CHECK (`comment` IS NULL OR length(trim(`comment`)) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_analysis_lawyer_verification_version_uidx`
ON `document_analysis_lawyer_verifications` (`analysis_id`,`document_version_id`,`lawyer_user_id`);
--> statement-breakpoint
CREATE INDEX `document_analysis_lawyer_verification_analysis_idx`
ON `document_analysis_lawyer_verifications` (`analysis_id`,`status`,`verified_at` DESC);
