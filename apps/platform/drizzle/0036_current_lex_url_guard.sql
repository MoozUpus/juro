DROP TRIGGER `legal_source_fetch_requests_insert_guard`;
--> statement-breakpoint
CREATE TRIGGER `legal_source_fetch_requests_insert_guard`
BEFORE INSERT ON `legal_source_fetch_requests`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'legal source fetch request scope invalid')
  WHERE NEW.`environment` NOT IN ('development','staging','production') OR
        NEW.`source_kind` NOT IN ('lex','advice') OR
        NEW.`locale` NOT IN ('ru','uz') OR
        NEW.`status` NOT IN ('queued','running','retrying','completed','failed','cancelled') OR
        NEW.`attempt_count` < 0;
  SELECT RAISE(ABORT, 'legal source fetch request URL invalid')
  WHERE instr(NEW.`requested_url`, '?') > 0 OR
        instr(NEW.`requested_url`, '#') > 0 OR
        (NEW.`source_kind` = 'lex' AND (
          substr(NEW.`requested_url`, 1, length('https://lex.uz/' || NEW.`locale` || '/docs/')) <>
            'https://lex.uz/' || NEW.`locale` || '/docs/' OR
          length(substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1)) = 0 OR
          (
            substr(
              substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1),
              1,
              1
            ) = '-' AND (
              length(substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1)) = 1 OR
              substr(
                substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1),
                2
              ) GLOB '*[^0-9]*'
            )
          ) OR
          (
            substr(
              substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1),
              1,
              1
            ) <> '-' AND
            substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1)
              GLOB '*[^0-9]*'
          ) OR
          NEW.`canonical_id` <>
            substr(NEW.`requested_url`, length('https://lex.uz/' || NEW.`locale` || '/docs/') + 1)
        )) OR
        (NEW.`source_kind` = 'advice' AND (
          substr(NEW.`requested_url`, 1, length('https://advice.uz/' || NEW.`locale` || '/questions/')) <>
            'https://advice.uz/' || NEW.`locale` || '/questions/' OR
          length(substr(NEW.`requested_url`, length('https://advice.uz/' || NEW.`locale` || '/questions/') + 1)) = 0 OR
          substr(NEW.`requested_url`, length('https://advice.uz/' || NEW.`locale` || '/questions/') + 1)
            GLOB '*[^0-9]*' OR
          NEW.`canonical_id` <>
            substr(NEW.`requested_url`, length('https://advice.uz/' || NEW.`locale` || '/questions/') + 1)
        ));
  SELECT RAISE(ABORT, 'legal source fetch request lifecycle invalid')
  WHERE (NEW.`source_id` IS NULL) <> (NEW.`version_id` IS NULL) OR
        (NEW.`status` = 'queued' AND (
          NEW.`attempt_count` <> 0 OR NEW.`started_at` IS NOT NULL OR
          NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
          NEW.`error_code` IS NOT NULL
        )) OR
        (NEW.`status` = 'running' AND (
          NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
          NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
          NEW.`error_code` IS NOT NULL
        )) OR
        (NEW.`status` = 'retrying' AND (
          NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
          NEW.`finished_at` IS NOT NULL OR NEW.`source_id` IS NOT NULL OR
          NEW.`error_code` IS NULL
        )) OR
        (NEW.`status` = 'completed' AND (
          NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
          NEW.`finished_at` IS NULL OR NEW.`source_id` IS NULL OR
          NEW.`version_id` IS NULL OR NEW.`error_code` IS NOT NULL
        )) OR
        (NEW.`status` = 'failed' AND (
          NEW.`attempt_count` < 1 OR NEW.`started_at` IS NULL OR
          NEW.`finished_at` IS NULL OR NEW.`source_id` IS NOT NULL OR
          NEW.`error_code` IS NULL
        )) OR
        (NEW.`status` = 'cancelled' AND NEW.`finished_at` IS NULL);
END;
