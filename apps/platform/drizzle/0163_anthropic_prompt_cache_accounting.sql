-- Migration 0163: retain content-free Anthropic prompt-cache write evidence.
-- The cached prefix is code-owned system instructions only; no prompt,
-- document, answer, filename or other user content is stored in these tables.
ALTER TABLE `ai_provider_usage_events`
ADD COLUMN `cache_creation_input_tokens` integer DEFAULT 0 NOT NULL
CHECK (`cache_creation_input_tokens` >= 0);
--> statement-breakpoint
ALTER TABLE `ai_cost_daily_aggregates`
ADD COLUMN `cache_creation_input_tokens` integer DEFAULT 0 NOT NULL
CHECK (`cache_creation_input_tokens` >= 0);
