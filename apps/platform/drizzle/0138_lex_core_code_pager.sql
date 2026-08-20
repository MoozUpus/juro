-- Keep the official Lex.uz title-search pager state for one core code at a
-- time.  This is operational metadata only: it contains no legal text.
ALTER TABLE `legal_corpus_core_code_targets`
  ADD COLUMN `page_number` integer NOT NULL DEFAULT 0
  CHECK (`page_number` BETWEEN 0 AND 12);
--> statement-breakpoint
ALTER TABLE `legal_corpus_core_code_targets`
  ADD COLUMN `next_event_target` text
  CHECK (`next_event_target` IS NULL OR length(`next_event_target`) BETWEEN 1 AND 512);
--> statement-breakpoint
ALTER TABLE `legal_corpus_core_code_targets`
  ADD COLUMN `view_state` text
  CHECK (`view_state` IS NULL OR length(`view_state`) BETWEEN 1 AND 262144);
--> statement-breakpoint
ALTER TABLE `legal_corpus_core_code_targets`
  ADD COLUMN `view_state_generator` text
  CHECK (`view_state_generator` IS NULL OR length(`view_state_generator`) BETWEEN 1 AND 512);
