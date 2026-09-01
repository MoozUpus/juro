# Advice.uz scenarios

Status: **EXCLUDED and disabled; not a citation source**

Evidence cutoff: **2026-09-01**

The active JURO contract uses direct official Lex.uz grounding and OpenAI/Anthropic providers. The owner instructed the agent to skip legislation-database/corpus work. v113 therefore performs no Advice.uz ingestion, sitemap discovery, vector indexing, scenario expansion, or source verification.

Checked-in production configuration sets `LEGAL_ADVICE_INGESTION_ENABLED` and `LEGAL_ADVICE_SITEMAP_DISCOVERY_ENABLED` to `false`. Advice.uz is not accepted as authority for legal citations.

Some older internal types use the label `advice` for generic secondary web evidence. That label does not mean Advice.uz is fetched or trusted: the corresponding runtime source class is `SECONDARY_REFERENCE`, and it cannot establish legislation, deadlines, calculations, or guaranteed outcomes. The terminology should be migrated separately to avoid ambiguity.

This required canonical path records an exclusion, not delivered Advice coverage.
