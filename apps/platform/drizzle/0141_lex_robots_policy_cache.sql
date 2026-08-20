-- A tiny, short-lived copy of the public robots policy avoids spending the
-- first safe Lex.uz request slot of every four-minute corpus run on an
-- identical control document. It never stores legal corpus text, credentials
-- or user data; the Worker revalidates the cached policy on every use and
-- refetches it after five minutes.
ALTER TABLE `legal_source_host_rate_limits`
  ADD COLUMN `robots_body` text;
--> statement-breakpoint
ALTER TABLE `legal_source_host_rate_limits`
  ADD COLUMN `robots_body_observed_at` text;
