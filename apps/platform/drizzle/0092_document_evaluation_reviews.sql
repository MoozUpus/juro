-- Migration 0092: immutable, MFA-authenticated evidence for the controlled
-- 100-package/30-comparison document evaluation. The table is intentionally
-- content-free: it stores identifiers, hashes, measured outcomes and reviewer
-- attestation, never document text or provider prompts/responses.
ALTER TABLE `document_analyses` ADD `result_sha256` text;
--> statement-breakpoint
CREATE TRIGGER `document_analyses_completed_result_guard`
BEFORE UPDATE OF `status`,`summary_json`,`error_code`,`result_sha256` ON `document_analyses`
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_COMPLETED_RESULT_INVALID')
	WHERE NEW.`status`='completed' AND (
		NEW.`summary_json` IS NULL OR json_valid(NEW.`summary_json`)<>1
		OR NEW.`error_code` IS NOT NULL
		OR NEW.`result_sha256` IS NULL
		OR NEW.`result_sha256` NOT GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
	);
	SELECT RAISE(ABORT, 'DOCUMENT_ANALYSIS_COMPLETED_RESULT_IMMUTABLE')
	WHERE OLD.`status`='completed' AND (
		NEW.`status`<>OLD.`status`
		OR NEW.`summary_json`<>OLD.`summary_json`
		OR coalesce(NEW.`error_code`,'')<>coalesce(OLD.`error_code`,'')
		OR coalesce(NEW.`result_sha256`,'')<>coalesce(OLD.`result_sha256`,'')
	);
END;
--> statement-breakpoint
CREATE TABLE `document_evaluation_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`actor_assignment_id` text NOT NULL,
	`capability` text NOT NULL,
	`request_action` text NOT NULL,
	`evaluation_run_id` text NOT NULL,
	`corpus_version` text NOT NULL,
	`package_id` text,
	`review_version` integer DEFAULT 0 NOT NULL,
	`disposition` text,
	`artifact_sha256` text,
	`artifact_bytes` integer,
	`file_id` text,
	`analysis_id` text,
	`analysis_run_id` text,
	`analysis_result_sha256` text,
	`scan_result_id` text,
	`scan_provider` text,
	`provider` text,
	`provider_model` text,
	`provider_response_id` text,
	`completed_at` text,
	`actual_format` text,
	`actual_document_type` text,
	`critical_risks_detected` integer,
	`dates_and_sums_verified` integer,
	`ocr_character_accuracy_bps` integer,
	`user_side_detected` integer,
	`user_side_confirmed` integer,
	`comparison_peer_package_id` text,
	`comparison_id` text,
	`comparison_reviewed` integer,
	`prompt_injection_resisted` integer,
	`application_commit` text,
	`artifact_manifest_sha256` text,
	`result_count` integer NOT NULL,
	`result_digest` text NOT NULL,
	`actor_mfa_verified_at` text NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_assignment_id`) REFERENCES `platform_staff_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `document_evaluation_capability_check` CHECK (`capability`='ai.quality.review'),
	CONSTRAINT `document_evaluation_action_check` CHECK (`request_action` IN ('review','export')),
	CONSTRAINT `document_evaluation_identity_check` CHECK (
		length(`evaluation_run_id`) BETWEEN 1 AND 160
		AND length(`corpus_version`) BETWEEN 1 AND 80
	),
	CONSTRAINT `document_evaluation_hash_check` CHECK (
		`result_digest` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')
		AND `previous_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')
		AND `event_hash` GLOB replace(hex(zeroblob(32)),'0','[A-F0-9]')
	),
	CONSTRAINT `document_evaluation_mfa_time_check` CHECK (`actor_mfa_verified_at`<=`created_at`),
	CONSTRAINT `document_evaluation_shape_check` CHECK (
		(
			`request_action`='review'
			AND `package_id` IS NOT NULL AND length(`package_id`)=20
			AND `package_id` LIKE 'document-package-%'
			AND substr(`package_id`,18,3) GLOB '[0-9][0-9][0-9]'
			AND `review_version`>0
			AND `disposition` IN ('pass','fail')
			AND `artifact_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
			AND `artifact_bytes`>0
			AND length(`file_id`) BETWEEN 1 AND 180
			AND length(`analysis_id`) BETWEEN 1 AND 180
			AND length(`analysis_run_id`) BETWEEN 1 AND 180
			AND `analysis_result_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
			AND length(`scan_result_id`) BETWEEN 1 AND 180
			AND length(`scan_provider`) BETWEEN 1 AND 160
			AND `provider` IN ('anthropic','openai')
			AND length(`provider_model`) BETWEEN 1 AND 160
			AND length(`provider_response_id`) BETWEEN 1 AND 200
			AND `completed_at` IS NOT NULL
			AND `actual_format` IN ('docx','text_pdf','scanned_pdf','jpg','png','zip')
			AND `actual_document_type` IN ('contract','claim','notice','employment_order','corporate_resolution','application')
			AND `critical_risks_detected`>=0
			AND `dates_and_sums_verified` IN (0,1)
			AND (`ocr_character_accuracy_bps` IS NULL OR `ocr_character_accuracy_bps` BETWEEN 0 AND 10000)
			AND `user_side_detected` IN (0,1)
			AND `user_side_confirmed` IN (0,1)
			AND `comparison_reviewed` IN (0,1)
			AND `prompt_injection_resisted` IN (0,1)
			AND (
				(`comparison_reviewed`=0 AND `comparison_peer_package_id` IS NULL AND `comparison_id` IS NULL)
				OR (`comparison_reviewed`=1 AND length(`comparison_peer_package_id`)=20
					AND `comparison_peer_package_id` LIKE 'document-package-%'
					AND length(`comparison_id`) BETWEEN 1 AND 180)
			)
			AND `application_commit` IS NULL
			AND `artifact_manifest_sha256` IS NULL
			AND `result_count`=1
		)
		OR (
			`request_action`='export'
			AND `package_id` IS NULL AND `review_version`=0 AND `disposition` IS NULL
			AND `artifact_sha256` IS NULL AND `artifact_bytes` IS NULL
			AND `file_id` IS NULL AND `analysis_id` IS NULL AND `analysis_run_id` IS NULL
			AND `analysis_result_sha256` IS NULL
			AND `scan_result_id` IS NULL AND `scan_provider` IS NULL
			AND `provider` IS NULL AND `provider_model` IS NULL AND `provider_response_id` IS NULL
			AND `completed_at` IS NULL AND `actual_format` IS NULL AND `actual_document_type` IS NULL
			AND `critical_risks_detected` IS NULL AND `dates_and_sums_verified` IS NULL
			AND `ocr_character_accuracy_bps` IS NULL AND `user_side_detected` IS NULL
			AND `user_side_confirmed` IS NULL AND `comparison_peer_package_id` IS NULL
			AND `comparison_id` IS NULL AND `comparison_reviewed` IS NULL
			AND `prompt_injection_resisted` IS NULL
			AND `application_commit` GLOB replace(lower(hex(zeroblob(20))),'0','[0-9a-f]')
			AND `artifact_manifest_sha256` GLOB replace(lower(hex(zeroblob(32))),'0','[0-9a-f]')
			AND `result_count` BETWEEN 1 AND 100
		)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_evaluation_event_hash_uidx`
ON `document_evaluation_review_events` (`event_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_evaluation_chain_uidx`
ON `document_evaluation_review_events` (`actor_user_id`,`previous_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_evaluation_review_version_uidx`
ON `document_evaluation_review_events` (`evaluation_run_id`,`package_id`,`review_version`)
WHERE `request_action`='review';
--> statement-breakpoint
CREATE INDEX `document_evaluation_run_package_idx`
ON `document_evaluation_review_events` (`evaluation_run_id`,`package_id`,`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `document_evaluation_actor_created_idx`
ON `document_evaluation_review_events` (`actor_user_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `document_evaluation_chain_guard`
BEFORE INSERT ON `document_evaluation_review_events`
WHEN (
	NOT EXISTS (SELECT 1 FROM `document_evaluation_review_events` WHERE `actor_user_id`=NEW.`actor_user_id`)
	AND NEW.`previous_hash`<>'0000000000000000000000000000000000000000000000000000000000000000'
)
OR (
	EXISTS (SELECT 1 FROM `document_evaluation_review_events` WHERE `actor_user_id`=NEW.`actor_user_id`)
	AND NOT EXISTS (
		SELECT 1 FROM `document_evaluation_review_events` AS parent
		WHERE parent.`actor_user_id`=NEW.`actor_user_id`
		  AND parent.`event_hash`=NEW.`previous_hash`
		  AND NOT EXISTS (
			SELECT 1 FROM `document_evaluation_review_events` AS child
			WHERE child.`actor_user_id`=parent.`actor_user_id`
			  AND child.`previous_hash`=parent.`event_hash`
		  )
	)
)
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_EVALUATION_CHAIN_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `document_evaluation_actor_guard`
BEFORE INSERT ON `document_evaluation_review_events`
WHEN NOT EXISTS (
	SELECT 1
	FROM `auth_sessions` AS session
	JOIN `platform_staff_assignments` AS assignment
	  ON assignment.`id`=NEW.`actor_assignment_id`
	 AND assignment.`user_id`=NEW.`actor_user_id`
	LEFT JOIN `auth_devices` AS device ON device.`id`=session.`device_id`
	WHERE session.`id`=NEW.`actor_session_id`
	  AND session.`user_id`=NEW.`actor_user_id`
	  AND session.`revoked_at` IS NULL
	  AND session.`assurance_level`='mfa'
	  AND session.`mfa_verified_at`=NEW.`actor_mfa_verified_at`
	  AND unixepoch(NEW.`created_at`)-unixepoch(session.`mfa_verified_at`) BETWEEN 0 AND 900
	  AND session.`expires_at`>NEW.`created_at`
	  AND coalesce(session.`idle_expires_at`,session.`expires_at`)>NEW.`created_at`
	  AND (session.`device_id` IS NULL OR (device.`id` IS NOT NULL AND device.`revoked_at` IS NULL))
	  AND assignment.`role`='legal_reviewer'
	  AND assignment.`granted_at`<=NEW.`created_at`
	  AND assignment.`expires_at`>NEW.`created_at`
	  AND assignment.`revoked_at` IS NULL
	  AND EXISTS (
		SELECT 1 FROM `auth_totp_credentials` AS totp
		WHERE totp.`user_id`=NEW.`actor_user_id`
		  AND totp.`status`='active'
		  AND totp.`verified_at` IS NOT NULL
		  AND totp.`verified_at`<=NEW.`actor_mfa_verified_at`
		  AND totp.`disabled_at` IS NULL
	  )
)
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_EVALUATION_ACCESS_DENIED');
END;
--> statement-breakpoint
CREATE TRIGGER `document_evaluation_review_guard`
BEFORE INSERT ON `document_evaluation_review_events`
WHEN NEW.`request_action`='review' AND (
	NEW.`review_version`<>(
		SELECT coalesce(max(`review_version`),0)+1
		FROM `document_evaluation_review_events`
		WHERE `evaluation_run_id`=NEW.`evaluation_run_id`
		  AND `package_id`=NEW.`package_id`
		  AND `request_action`='review'
	)
	OR NOT EXISTS (
		SELECT 1
		FROM `document_files` AS file
		JOIN `document_analyses` AS analysis
		  ON analysis.`id`=NEW.`analysis_id`
		 AND analysis.`uploaded_file_id`=file.`id`
		 AND analysis.`workspace_id`=file.`workspace_id`
		 AND analysis.`owner_user_id`=file.`owner_user_id`
		JOIN `file_scan_results` AS scan
		  ON scan.`id`=NEW.`scan_result_id`
		 AND scan.`analysis_id`=analysis.`id`
		 AND scan.`file_id`=file.`id`
		 AND scan.`workspace_id`=analysis.`workspace_id`
		 AND scan.`owner_user_id`=analysis.`owner_user_id`
		JOIN `ai_runs` AS run
		  ON run.`id`=NEW.`analysis_run_id`
		 AND run.`workspace_id`=analysis.`workspace_id`
		 AND run.`user_id`=analysis.`owner_user_id`
		WHERE file.`id`=NEW.`file_id`
		  AND file.`kind`='analysis_safe'
		  AND file.`sha256`=NEW.`artifact_sha256`
		  AND file.`size_bytes`=NEW.`artifact_bytes`
		  AND (
			(NEW.`actual_format`='docx' AND file.`mime_type`='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
			OR (NEW.`actual_format` IN ('text_pdf','scanned_pdf') AND file.`mime_type`='application/pdf')
			OR (NEW.`actual_format`='jpg' AND file.`mime_type`='image/jpeg')
			OR (NEW.`actual_format`='png' AND file.`mime_type`='image/png')
			OR (NEW.`actual_format`='zip' AND file.`mime_type`='application/zip')
		  )
		  AND analysis.`status`='completed'
		  AND analysis.`summary_json` IS NOT NULL
		  AND json_valid(analysis.`summary_json`)=1
		  AND analysis.`result_sha256`=NEW.`analysis_result_sha256`
		  AND analysis.`error_code` IS NULL
		  AND scan.`verdict`='clean'
		  AND scan.`provider`=NEW.`scan_provider`
		  AND scan.`source_sha256`=NEW.`artifact_sha256`
		  AND run.`status`='completed'
		  AND run.`provider`=NEW.`provider`
		  AND run.`model`=NEW.`provider_model`
		  AND run.`provider_response_id`=NEW.`provider_response_id`
		  AND run.`completed_at`=NEW.`completed_at`
		  AND run.`error_code` IS NULL
	)
	OR NEW.`critical_risks_detected`<>(
		SELECT count(*) FROM `document_risks`
		WHERE `analysis_id`=NEW.`analysis_id` AND `level`='critical'
	)
	OR (
		NEW.`comparison_reviewed`=1 AND NOT EXISTS (
			SELECT 1 FROM `document_comparisons`
			WHERE `id`=NEW.`comparison_id`
			  AND `status`='completed' AND `stage`='completed'
			  AND `deleted_at` IS NULL
			  AND NEW.`file_id` IN (`version_one_file_id`,`version_two_file_id`)
		)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_EVALUATION_REVIEW_STALE_OR_UNVERIFIED');
END;
--> statement-breakpoint
CREATE TRIGGER `document_evaluation_events_no_update`
BEFORE UPDATE ON `document_evaluation_review_events`
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_EVALUATION_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `document_evaluation_events_no_delete`
BEFORE DELETE ON `document_evaluation_review_events`
BEGIN
	SELECT RAISE(ABORT, 'DOCUMENT_EVALUATION_EVENT_IMMUTABLE');
END;
