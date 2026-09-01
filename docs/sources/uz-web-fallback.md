# Uzbekistan web fallback

Status: **PARTIAL; terminal low-authority fallback**

Evidence cutoff: **2026-09-01**

## Contract

General public-web research runs only after the combined official source result is weak or empty, only for current-law questions, only when enough request budget remains, and only when the independent `ai_secondary_web_research` operational flag is enabled.

OpenAI web search may propose up to three reputable non-Lex public materials relevant to Uzbekistan. A candidate is accepted only when its URL also appears in provider-owned web-source metadata, passes HTTPS URL canonicalization, is fetched with bounded redirects/time/size, and yields a clean relevant excerpt. It is labelled `SECONDARY_REFERENCE` and cannot establish a legal rule, deadline, calculation, or guaranteed result.

## Safety evidence

- strict structured result limits;
- HTTPS-only, no credentials, no nonstandard port, no literal IP, no local/test/onion suffix, and no sensitive query parameters;
- maximum 768 KiB response, three redirects, and four-second page timeout;
- script/style/SVG/canvas removal, prompt-injection pattern rejection, content hash, and request-scoped evidence;
- terminal ordering after official retrieval, with tests in `ai-chat-retrieval-safety.test.ts`.

## Open gate

The source URL canonicalizer does not itself resolve DNS and prove that every hostname remains outside private or link-local address space at connection time. Deployed Cloudflare network controls and the current production operational-flag value were not verified in v113. Keep this surface `PARTIAL` until the security audit resolves that SSRF boundary and the exact deployed controls are recorded.
