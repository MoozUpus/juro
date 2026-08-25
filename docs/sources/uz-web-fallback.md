# Uzbek web fallback

The Uzbek web fallback is a discovery mechanism, not a citation authority. When
direct lookup cannot identify a suitable official page, OpenAI Web Search may be
used to discover candidate URLs limited to `lex.uz` and `www.lex.uz`.

JURO then independently fetches the candidate under its own SSRF, redirect,
timeout, size, and content rules. Only a successfully parsed and validated
Lex.uz record can enter the source packet. Search snippets, arbitrary domains,
provider summaries, and generated URLs are discarded.

If no candidate survives validation, the system returns a source-unavailable or
clarification state. It does not widen the web allowlist or cite a convenient
secondary source.
