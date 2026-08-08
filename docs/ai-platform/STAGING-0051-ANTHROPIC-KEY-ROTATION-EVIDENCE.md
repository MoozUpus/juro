# Staging 0051 — Anthropic credential rotation evidence

Date: 2026-07-31 (Asia/Tashkent)

## Scope

This record verifies the owner's rotated `ANTHROPIC_API_KEY` in **staging only**. It does not exercise a user route, legal prompt, document, file, or production resource.

## Controlled execution

- Worker: `juro-platform-staging`.
- A closed one-time, fixed synthetic probe used the fresh logical id `staging-anthropic-connectivity-v5`.
- The temporary flag `STAGING_SYNTHETIC_PROBES_ENABLED` was enabled for the probe run and then returned to `false`.
- The probe persisted technical metadata only; no key, request body, legal content, or provider response body was stored.

## Result

The staging D1 row for the v5 probe recorded:

- provider: `anthropic`;
- status: `succeeded`;
- model: `claude-sonnet-4-6`;
- input tokens: `194`;
- output tokens: `8`;
- latency: `1420 ms`;
- error code: `null`.

The final checked staging Worker version is `8d299611-8755-41a1-8e16-9349bd291ea7`. Its configuration reports `ANTHROPIC_API_KEY` by name only and `STAGING_SYNTHETIC_PROBES_ENABLED ("false")`.

## Safety boundary

- The credential remains a server-side Cloudflare secret; it is not present in source, generated client assets, logs, or this document.
- Production was not read, changed, or probed.
- The probe is idempotent per `(probe_key, provider)` and has no HTTP endpoint.

## Follow-up

This proves staging provider connectivity, not legal-answer quality. Anthropic document-analysis staging evaluation remains gated on a safe/ready synthetic document and the Phase 5 analysis route/job tests.