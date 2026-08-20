-- Lex.uz uses an unauthenticated ASP.NET session to validate its public
-- search pager. Keep only the source-issued session id, only inside private
-- ingestion metadata, and expire it before the next broad crawl can reuse it.
ALTER TABLE `legal_corpus_core_code_targets`
  ADD COLUMN `source_session_cookie` text
  CHECK (`source_session_cookie` IS NULL OR `source_session_cookie` GLOB 'ASP.NET_SessionId=[A-Za-z0-9]*');
--> statement-breakpoint
ALTER TABLE `legal_corpus_core_code_targets`
  ADD COLUMN `source_session_expires_at` text;
--> statement-breakpoint
ALTER TABLE `legal_corpus_discovery_checkpoints`
  ADD COLUMN `source_session_cookie` text
  CHECK (`source_session_cookie` IS NULL OR `source_session_cookie` GLOB 'ASP.NET_SessionId=[A-Za-z0-9]*');
--> statement-breakpoint
ALTER TABLE `legal_corpus_discovery_checkpoints`
  ADD COLUMN `source_session_expires_at` text;
