# Staging 0048 provider probe evidence

Date: 2026-07-31 UTC

## Scope

This was a single protected staging-only connectivity check. It used fixed
synthetic technical input, no account, document, legal question, or provider
response text. No HTTP route was created. Production was not deployed or
queried.

## Migration and recovery evidence

- D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`);
- pre-migration Time Travel bookmark:
  `0000027f-00000000-000050b9-568547b6791b8ebf3181ddc4feec38c2`;
- pre-migration private R2 object:
  `d1/juro-staging/20260731-phase9/pre-0048.sql`;
- pre-migration export: 529,404 bytes, SHA-256
  `a17a152eea9fc16dcd95f3a61a6ca6093dcb201a5392b8014314abbbffb853fd`;
- migration `0048_staging_provider_probe.sql` applied successfully;
- post-migration Time Travel bookmark:
  `00000282-00000000-000050b9-4bd7353de17021bcc16033ffcda9b598`;
- post-migration private R2 object:
  `d1/juro-staging/20260731-phase9/post-0048.sql`;
- post-migration export: 532,542 bytes, SHA-256
  `d3337083b48abb922b7d66ac3b2178f4ff3c9239acdbe55e9182025c4880df0e`.

Both private R2 objects were independently downloaded and their SHA-256 values
matched the local export. Postflight returned `quick_check=ok`, zero
foreign-key violations, and no pending migrations.

## Runtime result

The feature flag was deployed as `true` only for one five-minute staging cron
cycle, then deployed back as `false`. The logical key permits no automatic
second attempt.

| Provider | Result | Safe technical evidence |
|---|---|---|
| OpenAI | Pass | `gpt-5.6-sol`; structured output validated; 75 input and 17 output tokens; 3,295 ms. |
| Anthropic | Blocked | `PROVIDER_UNAVAILABLE`; no response metadata or tokens stored. |

The OpenAI path is live-provider evidence only for this minimal transport and
structured-output request. It is not a legal-quality evaluation, a user-chat
validation, or evidence that document analysis is releasable. The Anthropic
failure is retained as a staging integration blocker; the system did not retry,
fall back, or claim a successful Claude analysis.

## Final protected staging state

- Worker: `juro-platform-staging`;
- final deployed version: `5c574a35-8b5e-4912-be8b-da1aed57369c`;
- `STAGING_SYNTHETIC_PROBES_ENABLED=false`;
- production Worker `juro`: unchanged.

## Anthropic model-remediation probe — 2026-08-01 Asia/Tashkent

The owner rotated the staging `ANTHROPIC_API_KEY`; its value was never read.
The second Anthropic-only probe (`staging-anthropic-connectivity-v2`) still
ended `PROVIDER_UNAVAILABLE`. Investigation identified the configured
`claude-sonnet-4-20250514` model as retired by Anthropic on 2026-06-15.

Staging was updated to `claude-sonnet-4-6` for both Anthropic runtime variables,
then the one-time `staging-anthropic-connectivity-v3` probe ran at
`2026-07-31T20:00:03.555Z`. It succeeded with validated structured output:
194 input tokens, 8 output tokens, and 2,262 ms latency. No request or response
text was persisted. The safe post-probe Worker version
`91edb0b9-3758-4959-97d6-27fc52d643ae` restored
`STAGING_SYNTHETIC_PROBES_ENABLED=false` at 100% traffic. Production was not
queried, deployed, or changed.
