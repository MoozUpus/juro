-- Migration 0090: immutable reviewer evidence for legal-version applicability.
CREATE TABLE `legal_source_applicability_records` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`source_id` text NOT NULL,
	`version_id` text NOT NULL,
	`effective_at` text NOT NULL,
	`expires_at` text,
	`reviewed_by_user_id` text NOT NULL,
	`reviewer_session_id` text NOT NULL,
	`mfa_verified_at` text NOT NULL,
	`evidence_json` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `legal_review_queue`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `legal_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `legal_source_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `legal_source_applicability_interval_check` CHECK (`expires_at` IS NULL OR `expires_at`>`effective_at`),
	CONSTRAINT `legal_source_applicability_evidence_check` CHECK (
		json_valid(`evidence_json`)=1
		AND length(`evidence_sha256`)=64
		AND `evidence_sha256` NOT GLOB '*[^0-9a-f]*'
		AND length(`reviewer_session_id`) BETWEEN 1 AND 180
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_applicability_review_uidx`
ON `legal_source_applicability_records` (`review_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_applicability_version_uidx`
ON `legal_source_applicability_records` (`version_id`);
--> statement-breakpoint
CREATE INDEX `legal_source_applicability_interval_idx`
ON `legal_source_applicability_records` (`effective_at`,`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `legal_source_applicability_insert_guard`
BEFORE INSERT ON `legal_source_applicability_records`
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_SOURCE_APPLICABILITY_REVIEW_INVALID')
	WHERE NOT EXISTS (
		SELECT 1 FROM `legal_review_queue` review
		INNER JOIN `legal_source_versions` version
			ON version.`id`=review.`version_id` AND version.`source_id`=review.`source_id`
		WHERE review.`id`=NEW.`review_id`
		  AND review.`source_id`=NEW.`source_id`
		  AND review.`version_id`=NEW.`version_id`
		  AND review.`status`='in_review'
		  AND review.`assigned_to_user_id`=NEW.`reviewed_by_user_id`
		  AND review.`decision` IS NULL
		  AND version.`status`='pending_review'
	);
	SELECT RAISE(ABORT, 'LEGAL_SOURCE_APPLICABILITY_EVIDENCE_INVALID')
	WHERE COALESCE((
		json_extract(NEW.`evidence_json`, '$.schemaVersion')=1
		AND json_extract(NEW.`evidence_json`, '$.recordId')=NEW.`id`
		AND json_extract(NEW.`evidence_json`, '$.reviewId')=NEW.`review_id`
		AND json_extract(NEW.`evidence_json`, '$.sourceId')=NEW.`source_id`
		AND json_extract(NEW.`evidence_json`, '$.versionId')=NEW.`version_id`
		AND json_extract(NEW.`evidence_json`, '$.effectiveAt')=NEW.`effective_at`
		AND json_extract(NEW.`evidence_json`, '$.expiresAt') IS NEW.`expires_at`
		AND json_extract(NEW.`evidence_json`, '$.reviewedByUserId')=NEW.`reviewed_by_user_id`
		AND json_extract(NEW.`evidence_json`, '$.reviewerSessionId')=NEW.`reviewer_session_id`
		AND json_extract(NEW.`evidence_json`, '$.mfaVerifiedAt')=NEW.`mfa_verified_at`
		AND json_extract(NEW.`evidence_json`, '$.createdAt')=NEW.`created_at`
	),0)=0;
END;
--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_approval_applicability_insert_guard`
BEFORE INSERT ON `legal_review_queue`
WHEN NEW.`status`='approved'
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_SOURCE_APPROVAL_APPLICABILITY_REQUIRED');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_review_queue_approval_applicability_update_guard`
BEFORE UPDATE ON `legal_review_queue`
WHEN NEW.`status`='approved' AND OLD.`status`<>'approved'
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_SOURCE_APPROVAL_APPLICABILITY_REQUIRED')
	WHERE NOT EXISTS (
		SELECT 1 FROM `legal_source_applicability_records` applicability
		WHERE applicability.`review_id`=NEW.`id`
		  AND applicability.`source_id`=NEW.`source_id`
		  AND applicability.`version_id`=NEW.`version_id`
		  AND applicability.`reviewed_by_user_id`=NEW.`decided_by_user_id`
		  AND applicability.`reviewer_session_id`=
			json_extract(NEW.`decision_evidence_json`, '$.reviewerSessionId')
		  AND applicability.`mfa_verified_at`=
			json_extract(NEW.`decision_evidence_json`, '$.mfaVerifiedAt')
		  AND applicability.`created_at`=NEW.`decided_at`
	);
END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_applicability_update_guard`
BEFORE UPDATE ON `legal_source_applicability_records`
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_SOURCE_APPLICABILITY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_applicability_delete_guard`
BEFORE DELETE ON `legal_source_applicability_records`
BEGIN
	SELECT RAISE(ABORT, 'LEGAL_SOURCE_APPLICABILITY_IMMUTABLE');
END;
